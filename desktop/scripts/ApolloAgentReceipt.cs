using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;

public static class ApolloAgentReceipt
{
    public static void Submit(string queue, string[] lines, string name)
    {
        using (var doc = new PrintDocument())
        using (var font = new Font("Courier New", 9))
        using (var format = new StringFormat(StringFormatFlags.LineLimit))
        {
            doc.PrinterSettings.PrinterName = queue;
            if (!doc.PrinterSettings.IsValid)
                throw new InvalidOperationException("Fila Windows não instalada.");
            doc.PrinterSettings.Copies = 1;
            doc.DocumentName = name;
            doc.PrintController = new StandardPrintController();
            doc.DefaultPageSettings.Margins = new Margins(10, 10, 8, 8);
            var pages = new List<string>();
            string rest = String.Join("\n", lines);
            int height = 394;
            using (var graphics = doc.PrinterSettings.CreateMeasurementGraphics())
            {
                while (rest.Length > 0)
                {
                    int characters, count;
                    var bounds = graphics.MeasureString(rest, font, new SizeF(285, 1110),
                        format, out characters, out count);
                    if (characters <= 0)
                        throw new InvalidOperationException("Não foi possível paginar o ticket.");
                    pages.Add(rest.Substring(0, characters));
                    height = Math.Max(height, (int)Math.Ceiling(bounds.Height) + 30);
                    rest = rest.Substring(characters);
                }
            }
            doc.DefaultPageSettings.PaperSize = new PaperSize("Apollo 80mm", 315, height);
            int page = 0;
            doc.PrintPage += delegate(object sender, PrintPageEventArgs args)
            {
                args.Graphics.DrawString(pages[page++], font, Brushes.Black,
                    new RectangleF(10, 8, 285, height - 16), format);
                args.HasMorePages = page < pages.Count;
            };
            doc.Print();
        }
    }
}
