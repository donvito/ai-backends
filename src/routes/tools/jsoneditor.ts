import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

const router = new OpenAPIHono();

const jsonEditorRoute = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      description: "Returns the AI Backend JSON editor interface for testing API payloads.",
      content: {
        "text/html": {
          schema: {
            type: "string"
          }
        },
      },
    },
  },
  tags: ["Tools"],
});

const jsonEditorHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Editor</title>
    <script src="https://unpkg.com/jsoneditor@10.1.0/dist/jsoneditor.min.js"></script>
    <link href="https://unpkg.com/jsoneditor@10.1.0/dist/jsoneditor.min.css" rel="stylesheet" type="text/css">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 5px;
            background-color: #f5f5f5;
            height: 100vh;
            overflow: hidden;
        }
        .container {
            max-width: none;
            margin: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 10px;
            border-radius: 8px;
            margin-bottom: 10px;
            flex-shrink: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-content {
            flex: 1;
        }
        .header h1 {
            margin: 0;
            font-size: 1.8em;
        }
        .header p {
            margin: 8px 0 0 0;
            opacity: 0.9;
            font-size: 0.9em;
        }
        .header-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .swagger-link {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.9em;
            font-weight: 500;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .swagger-link:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-1px);
        }
        .editor-container {
            display: flex;
            gap: 8px;
            flex: 1;
            min-height: 0;
        }
        .editor-panel {
            flex: 1;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
        }
        .panel-header {
            background: #f8f9fa;
            padding: 12px 8px;
            border-bottom: 1px solid #e9ecef;
            font-weight: 600;
            color: #495057;
            flex-shrink: 0;
        }
        .editor-wrapper {
            flex: 1;
            min-height: 0;
        }
        #jsoneditor, #jsoneditor2 {
            height: 100%;
        }
        .controls {
            margin: 10px 0;
            text-align: center;
            flex-shrink: 0;
        }
        .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            margin: 0 5px;
            transition: all 0.3s ease;
        }
        .btn:hover {
            background: #5a67d8;
            transform: translateY(-1px);
        }
        .btn-secondary {
            background: #6c757d;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .links {
            margin-top: 10px;
            text-align: center;
            flex-shrink: 0;
        }
        .links a {
            color: #667eea;
            text-decoration: none;
            margin: 0 10px;
            font-weight: 500;
            font-size: 0.9em;
        }
        .links a:hover {
            text-decoration: underline;
        }
        .footer {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-top: 10px;
            padding: 15px 10px;
            flex-shrink: 0;
            font-size: 0.85em;
            color: #6c757d;
            text-align: center;
        }
        .footer strong {
            color: #495057;
        }
        .footer a {
            color: #667eea;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
        @media (max-width: 768px) {
            body {
                overflow: auto;
                height: auto;
                padding: 3px;
            }
            .container {
                height: auto;
            }
            .header {
                flex-direction: column;
                gap: 10px;
                text-align: center;
            }
            .header-content {
                order: 1;
            }
            .header-actions {
                order: 2;
            }
            .editor-container {
                flex-direction: column;
                height: 70vh;
                gap: 5px;
            }
            .editor-panel {
                height: 50%;
                min-height: 300px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <h1>AI Backends JSON Editor</h1>
                <p>Edit, validate, and format JSON payloads for testing your AI Backend API endpoints</p>
            </div>
            <div class="header-actions">
                <a href="http://localhost:3000/api/ui" target="_blank" class="swagger-link">📊 Swagger UI</a>
            </div>
        </div>

        <div class="editor-container">
            <div class="editor-panel">
                <div class="panel-header">📝 JSON Input Editor</div>
                <div class="editor-wrapper">
                    <div id="jsoneditor"></div>
                </div>
            </div>
            <div class="editor-panel">
                <div class="panel-header">🎯 Formatted Output</div>
                <div class="editor-wrapper">
                    <div id="jsoneditor2"></div>
                </div>
            </div>
        </div>

        <div class="controls">
            <button class="btn" onclick="copyToOutput()">Copy to Output →</button>
            <button class="btn" onclick="validateJSON()">✓ Validate</button>
            <button class="btn" onclick="formatJSON()">🎨 Format</button>
            <button class="btn" onclick="minifyJSON()">📦 Minify</button>
            <button class="btn btn-secondary" onclick="clearEditors()">🗑 Clear</button>
        </div>

        <div class="links">
            <a href="/api/doc" target="_blank">📖 API Documentation</a>
            <a href="/" target="_blank">🏠 Home</a>
            <a href="https://github.com/josdejong/jsoneditor" target="_blank">ℹ️ About JSONEditor</a>
        </div>

        <div class="footer">
            <strong>JSONEditor</strong> by Jos de Jong © 2011-2024 | 
            Licensed under <a href="http://www.apache.org/licenses/LICENSE-2.0" target="_blank">Apache License 2.0</a> | 
            <a href="https://github.com/josdejong/jsoneditor" target="_blank">View on GitHub</a>
        </div>
    </div>

    <script>
        // Initialize JSON editors
        const container1 = document.getElementById('jsoneditor');
        const container2 = document.getElementById('jsoneditor2');
        
        const options1 = {
            mode: 'code',
            modes: ['code', 'tree', 'form', 'text', 'view'],
            theme: 'ace/theme/textmate',
            indentation: 2
        };
        
        const options2 = {
            mode: 'tree',
            modes: ['tree', 'code', 'form', 'text', 'view'],
            theme: 'ace/theme/textmate',
            indentation: 2
        };

        const editor1 = new JSONEditor(container1, options1);
        const editor2 = new JSONEditor(container2, options2);

        // Set initial example data
        const exampleData = {
            "message": "Analyze this text for sentiment",
            "text": "I love using this AI backend for my applications!",
            "model": "claude-3-sonnet",
            "options": {
                "temperature": 0.7,
                "max_tokens": 1000,
                "stream": false
            },
            "metadata": {
                "timestamp": new Date().toISOString(),
                "user_id": "user_123",
                "request_id": "req_" + Math.random().toString(36).substr(2, 9)
            }
        };
        
        editor1.set(exampleData);
        editor2.set(exampleData);

        function copyToOutput() {
            try {
                const json = editor1.get();
                editor2.set(json);
                showMessage('✅ JSON copied to output panel', 'success');
            } catch (error) {
                showMessage('❌ Invalid JSON: ' + error.message, 'error');
            }
        }

        function validateJSON() {
            try {
                const json = editor1.get();
                showMessage('✅ JSON is valid!', 'success');
            } catch (error) {
                showMessage('❌ Invalid JSON: ' + error.message, 'error');
            }
        }

        function formatJSON() {
            try {
                const json = editor1.get();
                editor1.set(json);
                showMessage('✅ JSON formatted successfully', 'success');
            } catch (error) {
                showMessage('❌ Cannot format invalid JSON: ' + error.message, 'error');
            }
        }

        function minifyJSON() {
            try {
                const json = editor1.get();
                const minified = JSON.stringify(json);
                editor1.setText(minified);
                showMessage('✅ JSON minified successfully', 'success');
            } catch (error) {
                showMessage('❌ Cannot minify invalid JSON: ' + error.message, 'error');
            }
        }

        function clearEditors() {
            if (confirm('Are you sure you want to clear both editors?')) {
                editor1.set({});
                editor2.set({});
                showMessage('🗑 Editors cleared', 'info');
            }
        }

        function showMessage(message, type) {
            // Create and show a temporary message
            const messageDiv = document.createElement('div');
            messageDiv.textContent = message;
            messageDiv.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                transition: all 0.3s ease;
                \${type === 'success' ? 'background: #28a745;' : 
                  type === 'error' ? 'background: #dc3545;' : 
                  'background: #17a2b8;'}
            \`;
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.style.opacity = '0';
                setTimeout(() => {
                    document.body.removeChild(messageDiv);
                }, 300);
            }, 3000);
        }

        // Add keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'Enter':
                        e.preventDefault();
                        copyToOutput();
                        break;
                    case 'l':
                        e.preventDefault();
                        formatJSON();
                        break;
                    case 'm':
                        e.preventDefault();
                        minifyJSON();
                        break;
                }
            }
        });

        // Add tooltips for keyboard shortcuts
        const tooltipDiv = document.createElement('div');
        tooltipDiv.style.marginTop = '15px';
        tooltipDiv.style.fontSize = '12px';
        tooltipDiv.style.color = '#6c757d';
        tooltipDiv.textContent = '💡 Shortcuts: Ctrl+Enter (Copy), Ctrl+L (Format), Ctrl+M (Minify)';
        document.querySelector('.controls').appendChild(tooltipDiv);
    </script>
</body>
</html>
`;

router.openapi(jsonEditorRoute, (c) => {
  return c.html(jsonEditorHTML);
});

export default {
  handler: router,
  mountPath: 'jsoneditor'
}; 
