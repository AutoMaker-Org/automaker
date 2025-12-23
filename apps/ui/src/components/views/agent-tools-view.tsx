import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  FolderOpen,
  Terminal,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  File,
  Pencil,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { TopHeader } from '@/components/layout/top-header';
import { GlassPanel } from '@/components/ui/glass-panel';
import { GlassCard } from '@/components/ui/glass-card';

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  timestamp: Date;
}

interface ToolExecution {
  tool: string;
  input: string;
  result: ToolResult | null;
  isRunning: boolean;
}

export function AgentToolsView() {
  const { currentProject } = useAppStore();
  const api = getElectronAPI();

  // Read File Tool State
  const [readFilePath, setReadFilePath] = useState('');
  const [readFileResult, setReadFileResult] = useState<ToolResult | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Write File Tool State
  const [writeFilePath, setWriteFilePath] = useState('');
  const [writeFileContent, setWriteFileContent] = useState('');
  const [writeFileResult, setWriteFileResult] = useState<ToolResult | null>(null);
  const [isWritingFile, setIsWritingFile] = useState(false);

  // Terminal Tool State
  const [terminalCommand, setTerminalCommand] = useState('ls');
  const [terminalResult, setTerminalResult] = useState<ToolResult | null>(null);
  const [isRunningCommand, setIsRunningCommand] = useState(false);

  // Execute Read File
  const handleReadFile = useCallback(async () => {
    if (!readFilePath.trim()) return;

    setIsReadingFile(true);
    setReadFileResult(null);

    try {
      // Simulate agent requesting file read
      console.log(`[Agent Tool] Requesting to read file: ${readFilePath}`);

      const result = await api.readFile(readFilePath);

      if (result.success) {
        setReadFileResult({
          success: true,
          output: result.content,
          timestamp: new Date(),
        });
        console.log(`[Agent Tool] File read successful: ${readFilePath}`);
      } else {
        setReadFileResult({
          success: false,
          error: result.error || 'Failed to read file',
          timestamp: new Date(),
        });
        console.log(`[Agent Tool] File read failed: ${result.error}`);
      }
    } catch (error) {
      setReadFileResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsReadingFile(false);
    }
  }, [readFilePath, api]);

  // Execute Write File
  const handleWriteFile = useCallback(async () => {
    if (!writeFilePath.trim() || !writeFileContent.trim()) return;

    setIsWritingFile(true);
    setWriteFileResult(null);

    try {
      // Simulate agent requesting file write
      console.log(`[Agent Tool] Requesting to write file: ${writeFilePath}`);

      const result = await api.writeFile(writeFilePath, writeFileContent);

      if (result.success) {
        setWriteFileResult({
          success: true,
          output: `File written successfully: ${writeFilePath}`,
          timestamp: new Date(),
        });
        console.log(`[Agent Tool] File write successful: ${writeFilePath}`);
      } else {
        setWriteFileResult({
          success: false,
          error: result.error || 'Failed to write file',
          timestamp: new Date(),
        });
        console.log(`[Agent Tool] File write failed: ${result.error}`);
      }
    } catch (error) {
      setWriteFileResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsWritingFile(false);
    }
  }, [writeFilePath, writeFileContent, api]);

  // Execute Terminal Command
  const handleRunCommand = useCallback(async () => {
    if (!terminalCommand.trim()) return;

    setIsRunningCommand(true);
    setTerminalResult(null);

    try {
      // Terminal command simulation for demonstration purposes
      console.log(`[Agent Tool] Simulating command: ${terminalCommand}`);

      // Simulated outputs for common commands (preview mode)
      // In production, the agent executes commands via Claude SDK
      const simulatedOutputs: Record<string, string> = {
        ls: 'app_spec.txt\nfeatures\nnode_modules\npackage.json\nsrc\ntests\ntsconfig.json',
        pwd: currentProject?.path || '/Users/demo/project',
        'echo hello': 'hello',
        whoami: 'automaker-agent',
        date: new Date().toString(),
        'cat package.json': '{\n  "name": "demo-project",\n  "version": "1.0.0"\n}',
      };

      // Simulate command execution delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      const output =
        simulatedOutputs[terminalCommand.toLowerCase()] ||
        `[Preview] ${terminalCommand}\n(Terminal commands are executed by the agent during feature implementation)`;

      setTerminalResult({
        success: true,
        output: output,
        timestamp: new Date(),
      });
      console.log(`[Agent Tool] Command executed successfully: ${terminalCommand}`);
    } catch (error) {
      setTerminalResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsRunningCommand(false);
    }
  }, [terminalCommand, currentProject]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="agent-tools-no-project">
        <div className="text-center">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Project Selected</h2>
          <p className="text-muted-foreground">Open or create a project to test agent tools.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <TopHeader />
      <div className="flex-1 flex flex-col overflow-hidden p-6 pt-0">
        <GlassPanel className="flex-1 flex flex-col overflow-hidden relative shadow-2xl bg-black/40 backdrop-blur-xl border-white/5">
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-600/20 border border-purple-500/30 flex items-center justify-center shadow-inner shadow-purple-500/20">
                <Wrench className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                  Agent Tools
                </h1>
                <p className="text-sm text-muted-foreground">
                  Test file system and terminal tools for {currentProject.name}
                </p>
              </div>
            </div>

            {/* Tools Grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 max-w-7xl">
                {/* Read File Tool */}
                <GlassCard
                  className="flex flex-col gap-4 bg-white/5 border-white/10"
                  data-testid="read-file-tool"
                >
                  <div className="flex items-center gap-3 pb-2 border-b border-white/5">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <File className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Read File</h3>
                      <p className="text-xs text-muted-foreground">Read from filesystem</p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <Label htmlFor="read-file-path">File Path</Label>
                      <Input
                        id="read-file-path"
                        placeholder="/path/to/file.txt"
                        value={readFilePath}
                        onChange={(e) => setReadFilePath(e.target.value)}
                        data-testid="read-file-path-input"
                        className="bg-black/20 border-white/10 focus:border-blue-500/50"
                      />
                    </div>
                    <Button
                      onClick={handleReadFile}
                      disabled={isReadingFile || !readFilePath.trim()}
                      className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30"
                      data-testid="read-file-button"
                    >
                      {isReadingFile ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Reading...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Read
                        </>
                      )}
                    </Button>

                    {/* Result */}
                    {readFileResult && (
                      <div
                        className={cn(
                          'p-3 rounded-lg border text-xs',
                          readFileResult.success
                            ? 'bg-green-500/10 border-green-500/20 text-green-300'
                            : 'bg-red-500/10 border-red-500/20 text-red-300'
                        )}
                        data-testid="read-file-result"
                      >
                        <div className="flex items-center gap-2 mb-2 font-medium">
                          {readFileResult.success ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span>{readFileResult.success ? 'Success' : 'Failed'}</span>
                        </div>
                        <pre className="overflow-auto max-h-40 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded border border-white/5">
                          {readFileResult.success ? readFileResult.output : readFileResult.error}
                        </pre>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Write File Tool */}
                <GlassCard
                  className="flex flex-col gap-4 bg-white/5 border-white/10"
                  data-testid="write-file-tool"
                >
                  <div className="flex items-center gap-3 pb-2 border-b border-white/5">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Pencil className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Write File</h3>
                      <p className="text-xs text-muted-foreground">Write to filesystem</p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <Label htmlFor="write-file-path">File Path</Label>
                      <Input
                        id="write-file-path"
                        placeholder="/path/to/file.txt"
                        value={writeFilePath}
                        onChange={(e) => setWriteFilePath(e.target.value)}
                        data-testid="write-file-path-input"
                        className="bg-black/20 border-white/10 focus:border-green-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="write-file-content">Content</Label>
                      <textarea
                        id="write-file-content"
                        placeholder="File content..."
                        value={writeFileContent}
                        onChange={(e) => setWriteFileContent(e.target.value)}
                        className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-white/10 bg-black/20 resize-y focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        data-testid="write-file-content-input"
                      />
                    </div>
                    <Button
                      onClick={handleWriteFile}
                      disabled={isWritingFile || !writeFilePath.trim() || !writeFileContent.trim()}
                      className="w-full bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                      data-testid="write-file-button"
                    >
                      {isWritingFile ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Writing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Write
                        </>
                      )}
                    </Button>

                    {/* Result */}
                    {writeFileResult && (
                      <div
                        className={cn(
                          'p-3 rounded-lg border text-xs',
                          writeFileResult.success
                            ? 'bg-green-500/10 border-green-500/20 text-green-300'
                            : 'bg-red-500/10 border-red-500/20 text-red-300'
                        )}
                        data-testid="write-file-result"
                      >
                        <div className="flex items-center gap-2 mb-2 font-medium">
                          {writeFileResult.success ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span>{writeFileResult.success ? 'Success' : 'Failed'}</span>
                        </div>
                        <pre className="overflow-auto max-h-40 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded border border-white/5">
                          {writeFileResult.success ? writeFileResult.output : writeFileResult.error}
                        </pre>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Terminal Tool */}
                <GlassCard
                  className="flex flex-col gap-4 bg-white/5 border-white/10"
                  data-testid="terminal-tool"
                >
                  <div className="flex items-center gap-3 pb-2 border-b border-white/5">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Terminal className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Run Terminal</h3>
                      <p className="text-xs text-muted-foreground">Execute shell commands</p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <Label htmlFor="terminal-command">Command</Label>
                      <Input
                        id="terminal-command"
                        placeholder="ls -la"
                        value={terminalCommand}
                        onChange={(e) => setTerminalCommand(e.target.value)}
                        data-testid="terminal-command-input"
                        className="bg-black/20 border-white/10 focus:border-purple-500/50 font-mono text-sm"
                      />
                    </div>
                    <Button
                      onClick={handleRunCommand}
                      disabled={isRunningCommand || !terminalCommand.trim()}
                      className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30"
                      data-testid="run-terminal-button"
                    >
                      {isRunningCommand ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Command
                        </>
                      )}
                    </Button>

                    {/* Result */}
                    {terminalResult && (
                      <div
                        className={cn(
                          'p-3 rounded-lg border text-xs',
                          terminalResult.success
                            ? 'bg-green-500/10 border-green-500/20 text-green-300'
                            : 'bg-red-500/10 border-red-500/20 text-red-300'
                        )}
                        data-testid="terminal-result"
                      >
                        <div className="flex items-center gap-2 mb-2 font-medium">
                          {terminalResult.success ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span>{terminalResult.success ? 'Success' : 'Failed'}</span>
                        </div>
                        <pre className="overflow-auto max-h-40 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded border border-white/5">
                          $ {terminalCommand}
                          {'\n'}
                          {terminalResult.success ? terminalResult.output : terminalResult.error}
                        </pre>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </div>

              {/* Tool Log Section */}
              <GlassCard className="mt-6 bg-white/5 border-white/10" data-testid="tool-log">
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-foreground">Tool Execution Log</h3>
                  <p className="text-sm text-muted-foreground">
                    View agent tool requests and responses
                  </p>

                  <div className="mt-4 space-y-2 text-sm bg-black/20 p-4 rounded-lg border border-white/5">
                    <p className="text-muted-foreground">
                      Open your browser&apos;s developer console to see detailed agent tool logs.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Read File - Agent requests file content from filesystem</li>
                      <li>Write File - Agent writes content to specified path</li>
                      <li>Run Terminal - Agent executes shell commands</li>
                    </ul>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
