using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

public static class Program {
  // Native Messaging keeps stdin open between messages. CopyToAsync does not
  // flush the destination FileStream; a small ping can otherwise stay buffered.
  private static async Task Pump(Stream source, Stream destination) {
    var buffer = new byte[8192];
    int count;
    while ((count = await source.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) != 0) {
      await destination.WriteAsync(buffer, 0, count).ConfigureAwait(false);
      await destination.FlushAsync().ConfigureAwait(false);
    }
  }

  private static async Task PumpInput(Process child) {
    try {
      await Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream).ConfigureAwait(false);
    } catch (Exception error) {
      Console.Error.WriteLine("Compagnon SAMI, entree : " + error.Message);
      try { if (!child.HasExited) child.Kill(); } catch {}
    } finally {
      try { child.StandardInput.Close(); } catch {}
    }
  }

  public static int Main() {
    try {
    var root = AppDomain.CurrentDomain.BaseDirectory;
    var script = Path.Combine(root, "src", "companion.mjs");
    var node = File.ReadAllText(Path.Combine(root, "node-path.txt")).Trim();
    if (!File.Exists(node)) throw new FileNotFoundException("Node.js introuvable. Relancez install-host.", node);
    var start = new ProcessStartInfo(node, "\"" + script + "\"") {
      UseShellExecute = false,
      CreateNoWindow = true,
      RedirectStandardInput = true,
      RedirectStandardOutput = true,
      RedirectStandardError = true
    };
    using (var child = Process.Start(start)) {
      if (child == null) return 2;
      var input = PumpInput(child);
      var output = Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
      var errors = Pump(child.StandardError.BaseStream, Console.OpenStandardError());
      Task.WaitAll(output, errors);
      child.WaitForExit();
      return child.ExitCode;
    }
    } catch (Exception error) {
      Console.Error.WriteLine("Compagnon SAMI : " + error.Message);
      return 1;
    }
  }
}
