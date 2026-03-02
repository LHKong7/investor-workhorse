import { marked } from 'marked';
import puppeteer from 'puppeteer';

/**
 * Configure marked options for financial reports
 */
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * HTML template for PDF generation with professional styling
 */
function getPDFHTMLTemplate(content: string, title: string = 'Financial Analysis Report'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', sans-serif;
      line-height: 1.6;
      color: #333;
      font-size: 11pt;
      padding: 40px 50px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    h1 {
      font-size: 28pt;
      color: #1a1a1a;
      margin-bottom: 20px;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 10px;
      page-break-after: avoid;
    }

    h2 {
      font-size: 20pt;
      color: #333;
      margin-top: 30px;
      margin-bottom: 15px;
      page-break-after: avoid;
      border-left: 4px solid #0066cc;
      padding-left: 12px;
    }

    h3 {
      font-size: 16pt;
      color: #555;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }

    h4 {
      font-size: 13pt;
      color: #666;
      margin-top: 15px;
      margin-bottom: 8px;
      font-weight: 600;
      page-break-after: avoid;
    }

    p {
      margin-bottom: 12px;
      text-align: justify;
    }

    ul, ol {
      margin-bottom: 12px;
      padding-left: 25px;
    }

    li {
      margin-bottom: 6px;
    }

    strong, b {
      color: #0066cc;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      page-break-inside: avoid;
      font-size: 10pt;
    }

    th {
      background-color: #0066cc;
      color: white;
      font-weight: 600;
      padding: 12px 8px;
      text-align: left;
      border: 1px solid #0052a3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', sans-serif;
    }

    td {
      padding: 10px 8px;
      border: 1px solid #ddd;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', sans-serif;
      vertical-align: top;
    }

    tr:nth-child(even) {
      background-color: #f9f9f9;
    }

    /* Ensure table text doesn't overflow */
    td, th {
      word-wrap: break-word;
      max-width: 300px;
      overflow-wrap: break-word;
    }

    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
    }

    pre {
      background-color: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 15px 0;
      page-break-inside: avoid;
    }

    pre code {
      background-color: transparent;
      padding: 0;
    }

    blockquote {
      border-left: 4px solid #0066cc;
      padding-left: 15px;
      margin: 15px 0;
      color: #555;
      font-style: italic;
    }

    hr {
      border: none;
      border-top: 2px solid #ddd;
      margin: 30px 0;
    }

    .page-break {
      page-break-after: always;
    }

    .no-break {
      page-break-inside: avoid;
    }

    @media print {
      body {
        padding: 0;
      }

      h1, h2, h3, h4 {
        page-break-after: avoid;
      }

      table, blockquote, pre {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

/**
 * Convert Markdown content to PDF buffer
 *
 * @param markdownContent - The Markdown content to convert
 * @param title - The document title
 * @returns Buffer containing the PDF data
 */
export async function convertMarkdownToPDF(
  markdownContent: string,
  title: string = 'Financial Analysis Report'
): Promise<Buffer> {
  try {
    // Convert Markdown to HTML
    const htmlContent = await marked(markdownContent);

    // Wrap in HTML template
    const fullHTML = getPDFHTMLTemplate(htmlContent, title);

    // Launch puppeteer with optimized settings
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
      ],
    });

    const page = await browser.newPage();

    // Set content and wait for it to load
    await page.setContent(fullHTML, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 9pt; color: #666; padding: 10px 20px; border-bottom: 1px solid #ddd; width: 100%;">
          <span style="font-weight: 600;">${title}</span>
          <span style="float: right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 8pt; color: #999; padding: 8px 20px; text-align: center; width: 100%;">
          Generated by Investor Workhorse | <span class="date"></span>
        </div>
      `,
      preferCSSPageSize: false,
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Error converting Markdown to PDF:', error);
    throw new Error(`Failed to convert Markdown to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a file is a Markdown file
 */
export function isMarkdownFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}
