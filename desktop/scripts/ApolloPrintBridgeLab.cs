// Homologacao isolada: somente comprovantes ficticios, sem API ou dados reais.
using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Printing;
using System.Diagnostics;
using System.Threading;

class ApolloPrintBridgeLab
{
    static void Mark(string path, string status)
    {
        using (var stream = new FileStream(path, FileMode.CreateNew,
            FileAccess.Write, FileShare.None))
        {
            byte[] data = Encoding.UTF8.GetBytes(status + " | " + DateTime.UtcNow.ToString("o"));
            stream.Write(data, 0, data.Length);
            stream.Flush(true);
        }
    }

    static int Main(string[] args)
    {
        Guid job;
        if (args.Length != 3 || args[0] != "--teste" ||
            !Guid.TryParse(args[2], out job) || job == Guid.Empty)
        {
            Console.WriteLine("Uso: --teste \"nome da impressora\" GUID");
            return 1;
        }
        string root = Path.Combine(Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData),
            "ApolloPrintBridge-Lab", "ImpressaoIntegrada", "Registros");
        Directory.CreateDirectory(root);
        string id = job.ToString("N");
        try
        {
            using (var gate = new FileStream(Path.Combine(root, "worker.lock"),
                FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                Console.WriteLine("Job: " + id);
                if (Directory.GetFiles(root, id + "-*.state").Length != 0)
                {
                    Console.WriteLine("BLOQUEADO: trabalho ja iniciado. Conferir papel e registros.");
                    return 2;
                }
                for (int via = 1; via <= 2; via++)
                {
                    string prefix = Path.Combine(root, id + "-" + via);
                    string[] lines = {
                        "ESPETERIA CHURRAS BURGUER",
                        "APOLLO PRINT BRIDGE C#",
                        "------------------------------",
                        "VIA " + via + " DE 2",
                        "MESA 05 - TESTE",
                        "2x Espetinho de cora\u00e7\u00e3o",
                        "1x Por\u00e7\u00e3o de mandioca",
                        "4x Chopp Brahma",
                        "------------------------------",
                        "SEM VALOR COMERCIAL",
                        "FIM DO TESTE"
                    };
                    using (var doc = new PrintDocument())
                    using (var font = new Font("Courier New", 9))
                    {
                        doc.PrinterSettings.PrinterName = args[1];
                        if (!doc.PrinterSettings.IsValid)
                            throw new InvalidOperationException("Fila Windows invalida.");
                        doc.PrinterSettings.Copies = 1;
                        doc.DocumentName = "Apollo CSharp - Teste Via " + via;
                        doc.DefaultPageSettings.PaperSize = new PaperSize("Apollo 80mm",
                            315, Math.Max(394, lines.Length * 18 + 40));
                        doc.DefaultPageSettings.Margins = new Margins(10, 10, 5, 5);
                        doc.PrintController = new StandardPrintController();
                        doc.PrintPage += delegate(object sender, PrintPageEventArgs e)
                        {
                            // Match the single DrawString rendering of the physically successful C# test.
                            e.Graphics.DrawString(string.Join("\n", lines),
                                font, Brushes.Black, 10, 5);
                            e.HasMorePages = false;
                        };
                        Mark(prefix + "-started.state", "INICIADO");
                        doc.Print();
                        Mark(prefix + "-accepted.state", "PRINT_RETORNOU_SEM_CONFIRMACAO_FISICA");
                        Console.WriteLine("Via " + via + ": chamada Print retornou; confira o papel.");
                    }
                    if (via == 1) Thread.Sleep(1000);
                }
                Console.WriteLine("RAM_MB: " + Math.Round(
                    Process.GetCurrentProcess().WorkingSet64 / 1048576.0, 2));
                Console.WriteLine("Registros: " + root);
                return 0;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("INTERROMPIDO: " + ex.Message);
            Console.WriteLine("Nao reenviar automaticamente. Conferir papel e registros.");
            return 3;
        }
    }
}
