import { OpenAPIHono } from "@hono/zod-openapi"
import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'

type LoadedRoute = { handler: OpenAPIHono; mountPath: string }

function getRoutesDirForVersion(version: string): string | null {
    const baseDir = path.join(__dirname, '../routes')
    const versionDir = path.join(baseDir, version)

    if (fs.existsSync(versionDir) && fs.statSync(versionDir).isDirectory()) {
        return versionDir
    }

    // Backward compatibility: treat top-level routes as v1 when v1/ folder doesn't exist
    if (version === 'v1' && fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
        return baseDir
    }

    return null
}

async function loadRoutesForVersion(version: string): Promise<LoadedRoute[]> {
    const routesDir = getRoutesDirForVersion(version)
    if (!routesDir) return []

    // Recursively collect .ts files under the version directory
    const collectRouteFiles = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        const files: string[] = []
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                files.push(...collectRouteFiles(full))
            } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
                files.push(full)
            }
        }
        return files
    }

    const routeFiles = collectRouteFiles(routesDir)

    const routes: LoadedRoute[] = []
    for (const routePath of routeFiles) {
        const routeModule = await import(routePath)
        const moduleExport = routeModule.default

        const handler = moduleExport?.handler || moduleExport
        const mountPath: string = moduleExport?.mountPath || path.basename(routePath).replace('.ts', '')

        if (
            handler &&
            typeof handler === 'object' &&
            'routes' in handler &&
            Array.isArray((handler as any).routes) &&
            typeof (handler as any).fetch === 'function' &&
            typeof (handler as any).route === 'function'
        ) {
            routes.push({ handler, mountPath })
        } else {
            console.warn(
                `[WARN] Route file '${path.relative(routesDir, routePath)}' for ${version} (resolved handler type: ${typeof handler}) does not export a valid Hono router instance. Expected an object with an array 'routes' property and fetch/route methods. Skipping.`
            )
            if (handler && typeof handler === 'object') {
                console.warn(
                    `[DEBUG] Problematic handler for ${path.relative(routesDir, routePath)} has keys: ${Object.keys(handler).join(', ')}. Is routes an array? ${Array.isArray((handler as any).routes)}`
                )
            }
        }
    }
    return routes
}

async function loadTopLevelRoutes(): Promise<LoadedRoute[]> {
    const baseDir = path.join(__dirname, '../routes')
    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return []

    // Recursively collect .ts files in routes, excluding versioned folders like v1/, v2/, etc.
    const isVersionDir = (dirName: string) => /^v\d+$/.test(dirName)
    const collectRouteFiles = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        const files: string[] = []
        for (const entry of entries) {
            // Skip versioned directories; those are loaded separately
            if (entry.isDirectory()) {
                if (isVersionDir(entry.name)) continue
                files.push(...collectRouteFiles(path.join(dir, entry.name)))
            } else if (
                entry.isFile() &&
                entry.name.endsWith('.ts') &&
                !entry.name.endsWith('.test.ts')
            ) {
                files.push(path.join(dir, entry.name))
            }
        }
        return files
    }

    const routeFiles = collectRouteFiles(baseDir)

    const routes: LoadedRoute[] = []
    for (const routePath of routeFiles) {
        const routeModule = await import(routePath)
        const moduleExport = routeModule.default

        const handler = moduleExport?.handler || moduleExport
        const mountPath: string = moduleExport?.mountPath || path.basename(routePath).replace('.ts', '')

        if (
            handler &&
            typeof handler === 'object' &&
            'routes' in handler &&
            Array.isArray((handler as any).routes) &&
            typeof (handler as any).fetch === 'function' &&
            typeof (handler as any).route === 'function'
        ) {
            routes.push({ handler, mountPath })
        } else {
            console.warn(
                `[WARN] Route file '${path.relative(baseDir, routePath)}' (resolved handler type: ${typeof handler}) does not export a valid Hono router instance. Expected an object with an array 'routes' property and fetch/route methods. Skipping.`
            )
            if (handler && typeof handler === 'object') {
                console.warn(
                    `[DEBUG] Problematic handler for ${path.relative(baseDir, routePath)} has keys: ${Object.keys(handler).join(', ')}. Is routes an array? ${Array.isArray((handler as any).routes)}`
                )
            }
        }
    }
    return routes
}

function discoverAvailableVersions(): string[] {
    const baseDir = path.join(__dirname, '../routes')
    const versions = new Set<string>()

    if (!fs.existsSync(baseDir)) return ['v1']

    // Add explicit vN folders
    for (const entry of fs.readdirSync(baseDir)) {
        const full = path.join(baseDir, entry)
        if (fs.statSync(full).isDirectory() && /^v\d+$/.test(entry)) {
            versions.add(entry)
        }
    }

    // Always include v1 for backward compatibility
    versions.add('v1')
    return Array.from(versions).sort()
}

async function configureRoutes(app: OpenAPIHono) {
    const versions = discoverAvailableVersions()

    // Load and mount unversioned routes directly under /api/<mountPath>
    const unversionedRoutes = await loadTopLevelRoutes()
    const unversionedMounts = new Set(unversionedRoutes.map((r) => r.mountPath))
    for (const { handler, mountPath } of unversionedRoutes) {
        app.route(`/api/${mountPath}`, handler)
    }

    // Build and mount routers for each version
    for (const version of versions) {
        const versionRoutes = await loadRoutesForVersion(version)
        if (versionRoutes.length === 0) continue

        const versionRouter = new OpenAPIHono()
        for (const { handler, mountPath } of versionRoutes) {
            versionRouter.route('/' + mountPath, handler)
        }

        // Mount versioned path, e.g., /api/v1, /api/v2, ...
        app.route(`/api/${version}`, versionRouter)

        // TO BE DEPRECATED when everyone has moved to the versioned routes
        // Backward compatibility: also expose v1 routes at /api/<mountPath>
        // using lightweight forwarders so docs don't duplicate unversioned paths
        if (version === 'v1') {
            for (const { mountPath } of versionRoutes) {
                // Do not create a forwarder if an unversioned route already exists for this mountPath
                if (unversionedMounts.has(mountPath)) continue

                const forwarder = new Hono()
                forwarder.all('/*', (c) => {
                    const incomingUrl = new URL(c.req.url)
                    const originalPath = incomingUrl.pathname
                    const base = `/api/${mountPath}`
                    const suffix = originalPath.startsWith(base)
                        ? originalPath.slice(base.length) // '' or '/...'
                        : ''
                    const targetPath = `/${mountPath}${suffix}` || `/${mountPath}`
                    incomingUrl.pathname = targetPath
                    return versionRouter.fetch(new Request(incomingUrl.toString(), c.req.raw))
                })
                app.route(`/api/${mountPath}`, forwarder as any)
            }
        }
    }
}

export default configureRoutes
