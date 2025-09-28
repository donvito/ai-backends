import * as fs from 'fs'
import * as path from 'path'

// Lazy load pdf-parse to avoid debug mode issue
let pdfParse: any;

async function getPdfParser() {
  if (!pdfParse) {
    // Use wrapper to prevent debug mode issues
    // @ts-ignore
      const module = await import('./pdfParseWrapper.js');
    pdfParse = module.default || module;
  }
  return pdfParse;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  pages?: number;
  text: string;
}

/**
 * Extracts text content from a local PDF file
 * @param filePath The local file path of the PDF to extract
 * @returns The extracted text and metadata
 */
export async function extractPDFFromFile(filePath: string): Promise<PDFMetadata> {
  try {
    // Resolve the file path
    const resolvedPath = path.resolve(filePath)
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`PDF file not found: ${resolvedPath}`)
    }

    // Read the PDF file
    const buffer = fs.readFileSync(resolvedPath)

    // Parse the PDF
    const pdf = await getPdfParser()
    const data = await pdf(buffer)

    return {
      title: data.info?.Title,
      author: data.info?.Author,
      pages: data.numpages,
      text: data.text.trim(),
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PDF extraction failed: ${error.message}`)
    }
    throw new Error('PDF extraction failed: Unknown error')
  }
}

/**
 * Fetches and extracts text content from a PDF URL
 * @param url The URL of the PDF to extract
 * @returns The extracted text and metadata
 */
export async function extractPDFFromURL(url: string): Promise<PDFMetadata> {
  try {
    // Fetch the PDF from the URL
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    // Check if the content type is PDF
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      throw new Error(`Invalid content type: ${contentType}. Expected application/pdf`);
    }

    // Get the PDF data as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse the PDF
    const pdf = await getPdfParser();
    const data = await pdf(buffer);

    return {
      title: data.info?.Title,
      author: data.info?.Author,
      pages: data.numpages,
      text: data.text.trim(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
    throw new Error('PDF extraction failed: Unknown error');
  }
}

/**
 * Extracts text content from a PDF (either URL or local file path)
 * @param source The URL or local file path of the PDF to extract
 * @returns The extracted text and metadata
 */
export async function extractPDF(source: string): Promise<PDFMetadata> {
  // Check if it's a URL (starts with http:// or https://)
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return extractPDFFromURL(source)
  } else {
    return extractPDFFromFile(source)
  }
}

/**
 * Truncates text to a maximum length while trying to preserve complete sentences
 * @param text The text to truncate
 * @param maxLength The maximum length
 * @returns The truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to find the last sentence boundary before maxLength
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');
  
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
  
  if (lastSentenceEnd > maxLength * 0.8) {
    // If we found a sentence ending reasonably close to the max length, use it
    return text.substring(0, lastSentenceEnd + 1);
  }
  
  // Otherwise, truncate at the last space before maxLength
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.9) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  // If no good space found, just truncate
  return truncated + '...';
}