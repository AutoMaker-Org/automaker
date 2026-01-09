import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

const logger = createLogger('AgentToolsView');

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
      logger.info(`[Agent Tool] Requesting to read file: ${readFilePath}`);

      const result = await api.readFile(readFilePath);

      if (result.success) {
        setReadFileResult({
          success: true,
          output: result.content,
          timestamp: new Date(),
        });
        logger.info(`[Agent Tool] File read successful: ${readFilePath}`);
      } else {
        setReadFileResult({
          success: false,
          error: result.error || 'Failed to read file',
          timestamp: new Date(),
        });
        logger.info(`[Agent Tool] File read failed: ${result.error}`);
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
      logger.info(`[Agent Tool] Requesting to write file: ${writeFilePath}`);

      const result = await api.writeFile(writeFilePath, writeFileContent);

      if (result.success) {
        setWriteFileResult({
          success: true,
          output: `File written successfully: ${writeFilePath}`,
          timestamp: new Date(),
        });
        logger.info(`[Agent Tool] File write successful: ${writeFilePath}`);
      } else {
        setWriteFileResult({
          success: false,
          error: result.error || 'Failed to write file',
          timestamp: new Date(),
        });
        logger.info(`[Agent Tool] File write failed: ${result.error}`);
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
      logger.info(`[Agent Tool] Simulating command: ${terminalCommand}`);

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
      logger.info(`[Agent Tool] Command executed successfully: ${terminalCommand}`);
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
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="agent-tools-view">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-glass backdrop-blur-md">
        <Wrench className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Agent Tools</h1>
          <p className="text-sm text-muted-foreground">
            Test file system and terminal tools for {currentProject.name}
          </p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {/* Read File Tool */}
          <Card data-testid="read-file-tool">
            <CardHeader>
              <div className="flex items-center gap-2">
                <File className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-lg">Read File</CardTitle>
              </div>
              <CardDescription>Agent requests to read a file from the filesystem</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="read-file-path">File Path</Label>
                <Input
                  id="read-file-path"
                  placeholder="/path/to/file.txt"
                  value={readFilePath}
                  onChange={(e) => setReadFilePath(e.target.value)}
                  data-testid="read-file-path-input"
                />
              </div>
              <Button
                onClick={handleReadFile}
                disabled={isReadingFile || !readFilePath.trim()}
                className="w-full"
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
                    'p-3 rounded-md border',
                    readFileResult.success
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  )}
                  data-testid="read-file-result"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {readFileResult.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {readFileResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                    {readFileResult.success ? readFileResult.output : readFileResult.error}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Write File Tool */}
          <Card data-testid="write-file-tool">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-green-500" />
                <CardTitle className="text-lg">Write File</CardTitle>
              </div>
              <CardDescription>Agent requests to write content to a file</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="write-file-path">File Path</Label>
                <Input
                  id="write-file-path"
                  placeholder="/path/to/file.txt"
                  value={writeFilePath}
                  onChange={(e) => setWriteFilePath(e.target.value)}
                  data-testid="write-file-path-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="write-file-content">Content</Label>
                <textarea
                  id="write-file-content"
                  placeholder="File content..."
                  value={writeFileContent}
                  onChange={(e) => setWriteFileContent(e.target.value)}
                  className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
                  data-testid="write-file-content-input"
                />
              </div>
              <Button
                onClick={handleWriteFile}
                disabled={isWritingFile || !writeFilePath.trim() || !writeFileContent.trim()}
                className="w-full"
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
                    'p-3 rounded-md border',
                    writeFileResult.success
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  )}
                  data-testid="write-file-result"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {writeFileResult.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {writeFileResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                    {writeFileResult.success ? writeFileResult.output : writeFileResult.error}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Terminal Tool */}
          <Card data-testid="terminal-tool">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-lg">Run Terminal</CardTitle>
              </div>
              <CardDescription>Agent requests to execute a terminal command</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="terminal-command">Command</Label>
                <Input
                  id="terminal-command"
                  placeholder="ls -la"
                  value={terminalCommand}
                  onChange={(e) => setTerminalCommand(e.target.value)}
                  data-testid="terminal-command-input"
                />
              </div>
              <Button
                onClick={handleRunCommand}
                disabled={isRunningCommand || !terminalCommand.trim()}
                className="w-full"
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
                    'p-3 rounded-md border',
                    terminalResult.success
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  )}
                  data-testid="terminal-result"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {terminalResult.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {terminalResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap font-mono bg-black/50 text-green-400 p-2 rounded">
                    $ {terminalCommand}
                    {'\n'}
                    {terminalResult.success ? terminalResult.output : terminalResult.error}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tool Log Section */}
        <Card className="mt-6" data-testid="tool-log">
          <CardHeader>
            <CardTitle className="text-lg">Tool Execution Log</CardTitle>
            <CardDescription>View agent tool requests and responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Open your browser&apos;s developer console to see detailed agent tool logs.
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Read File - Agent requests file content from filesystem</li>
                <li>Write File - Agent writes content to specified path</li>
                <li>Run Terminal - Agent executes shell commands</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
