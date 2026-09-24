using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

public static class Program {
  public static int Main() {
    var root = AppDomain.CurrentDomain.BaseDirectory;
    var script = Path.Combine(root, "src", "companion.mjs");
    var start = new ProcessStartInfo("node", "\"" + script + "\"") {
      UseShellExecute = false,
      CreateNoWindow = true,
      RedirectStandardInput = true,
      RedirectStandardOutput = true,
      RedirectStandardError = true
    };
    using (var child = Process.Start(start)) {
      if (child == null) return 2;
      var input = Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream).ContinueWith(_ => child.StandardInput.Close());
      var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
      var errors = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
      Task.WaitAll(output, errors);
      child.WaitForExit();
      return child.ExitCode;
    }
  }
}
