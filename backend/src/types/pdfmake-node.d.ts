// pdfmake@0.2.x no trae tipos y su paquete principal (`src/printer.js`) exporta la
// clase servidora `PdfPrinter` directamente. `@types/pdfmake` tipa la API de
// navegador (VFS y `pdfMake`), no esta clase, por eso se declara el módulo aquí.
// Uso en servidor: `import PdfPrinter = require("pdfmake")` y luego
// `new PdfPrinter(fuentes).createPdfKitDocument(dd)`. Los tipos viven en un
// namespace con el mismo nombre (merging) para colgar de ese identificador.
// Las fuentes Roboto (base64) se cargan con `require("pdfmake/build/vfs_fonts.js")`.

declare module "pdfmake" {
  namespace PdfPrinter {
    interface PdfMakeFont {
      normal: Buffer;
      bold?: Buffer;
      italics?: Buffer;
      bolditalics?: Buffer;
    }
    type PdfMakeFonts = Record<string, PdfMakeFont>;

    interface TDocumentDefinitions {
      content: unknown[];
      styles?: Record<string, Record<string, unknown>>;
      defaultStyle?: Record<string, unknown>;
      pageSize?: string;
      pageOrientation?: "portrait" | "landscape";
      pageMargins?: number | [number, number, number, number];
      info?: Record<string, unknown>;
      header?: unknown;
      footer?: unknown;
    }
  }

  class PdfPrinter {
    constructor(fontDescriptors: PdfPrinter.PdfMakeFonts);
    createPdfKitDocument(docDefinition: PdfPrinter.TDocumentDefinitions): NodeJS.ReadWriteStream;
  }
  export = PdfPrinter;
}
