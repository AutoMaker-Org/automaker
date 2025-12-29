import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import type { MCPServerConfig } from '@automaker/types';
import { syncSettingsToServer, loadMCPServersFromServer } from '@/hooks/use-settings-migration';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { ServerFormData, ServerTestState } from '../types';
import { defaultFormData } from '../types';
import { MAX_RECOMMENDED_TOOLS } from '../constants';
import type { ServerType } from '../types';

/** Pending server data waiting for security confirmation */
interface PendingServerData {
  type: 'add' | 'import';
  serverData?: Omit<MCPServerConfig, 'id'>;
  importServers?: Array<Omit<MCPServerConfig, 'id'>>;
  serverType: ServerType;
  command?: string;
  args?: string[];
  url?: string;
}

export function useMCPServers() {
  const {
    mcpServers,
    addMCPServer,
    updateMCPServer,
    removeMCPServer,
    mcpAutoApproveTools,
    mcpUnrestrictedTools,
    setMcpAutoApproveTools,
    setMcpUnrestrictedTools,
  } = useAppStore();

  // State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [formData, setFormData] = useState<ServerFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverTestStates, setServerTestStates] = useState<Record<string, ServerTestState>>({});
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [jsonEditServer, setJsonEditServer] = useState<MCPServerConfig | null>(null);
  const [jsonEditValue, setJsonEditValue] = useState('');
  const [isGlobalJsonEditOpen, setIsGlobalJsonEditOpen] = useState(false);
  const [globalJsonValue, setGlobalJsonValue] = useState('');
  const autoTestedServersRef = useRef<Set<string>>(new Set());

  // Security warning dialog state
  const [isSecurityWarningOpen, setIsSecurityWarningOpen] = useState(false);
  const [pendingServerData, setPendingServerData] = useState<PendingServerData | null>(null);

  // Computed values
  const totalToolsCount = useMemo(() => {
    let count = 0;
    for (const server of mcpServers) {
      if (server.enabled !== false) {
        const testState = serverTestStates[server.id];
        if (testState?.status === 'success' && testState.tools) {
          count += testState.tools.length;
        }
      }
    }
    return count;
  }, [mcpServers, serverTestStates]);

  const showToolsWarning = totalToolsCount > MAX_RECOMMENDED_TOOLS;

  // Auto-load MCP servers from settings file on mount
  useEffect(() => {
    loadMCPServersFromServer().catch((error) => {
      console.error('Failed to load MCP servers on mount:', error);
    });
  }, []);

  // Test a single server (extracted for reuse)
  const testServer = useCallback(async (server: MCPServerConfig, silent = false) => {
    setServerTestStates((prev) => ({
      ...prev,
      [server.id]: { status: 'testing' },
    }));

    try {
      const api = getHttpApiClient();
      const result = await api.mcp.testServer(server.id);

      if (result.success) {
        setServerTestStates((prev) => ({
          ...prev,
          [server.id]: {
            status: 'success',
            tools: result.tools,
            connectionTime: result.connectionTime,
          },
        }));
        // Only auto-expand on manual test, not on auto-test (silent)
        if (!silent) {
          setExpandedServers((prev) => new Set([...prev, server.id]));
          toast.success(
            `Connected to ${server.name} (${result.tools?.length || 0} tools, ${result.connectionTime}ms)`
          );
        }
      } else {
        setServerTestStates((prev) => ({
          ...prev,
          [server.id]: {
            status: 'error',
            error: result.error,
            connectionTime: result.connectionTime,
          },
        }));
        if (!silent) {
          toast.error(`Failed to connect: ${result.error}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setServerTestStates((prev) => ({
        ...prev,
        [server.id]: {
          status: 'error',
          error: errorMessage,
        },
      }));
      if (!silent) {
        toast.error(`Test failed: ${errorMessage}`);
      }
    }
  }, []);

  // Auto-test all enabled servers on mount
  useEffect(() => {
    const enabledServers = mcpServers.filter((s) => s.enabled !== false);
    const serversToTest = enabledServers.filter((s) => !autoTestedServersRef.current.has(s.id));

    if (serversToTest.length > 0) {
      // Mark all as being tested
      serversToTest.forEach((s) => autoTestedServersRef.current.add(s.id));

      // Test all servers in parallel (silently - no toast spam)
      serversToTest.forEach((server) => {
        testServer(server, true);
      });
    }
  }, [mcpServers, testServer]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const success = await loadMCPServersFromServer();
      if (success) {
        toast.success('MCP servers refreshed from settings');
      } else {
        toast.error('Failed to refresh MCP servers');
      }
    } catch {
      toast.error('Error refreshing MCP servers');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTestServer = (server: MCPServerConfig) => {
    testServer(server, false); // false = show toast notifications
  };

  const toggleServerExpanded = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const handleOpenAddDialog = () => {
    setFormData(defaultFormData);
    setEditingServer(null);
    setIsAddDialogOpen(true);
  };

  const handleOpenEditDialog = (server: MCPServerConfig) => {
    setFormData({
      name: server.name,
      description: server.description || '',
      type: server.type || 'stdio',
      command: server.command || '',
      args: server.args?.join(' ') || '',
      url: server.url || '',
      headers: server.headers ? JSON.stringify(server.headers, null, 2) : '',
      env: server.env ? JSON.stringify(server.env, null, 2) : '',
    });
    setEditingServer(server);
    setIsAddDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsAddDialogOpen(false);
    setEditingServer(null);
    setFormData(defaultFormData);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Server name is required');
      return;
    }

    if (formData.type === 'stdio' && !formData.command.trim()) {
      toast.error('Command is required for stdio servers');
      return;
    }

    if ((formData.type === 'sse' || formData.type === 'http') && !formData.url.trim()) {
      toast.error('URL is required for SSE/HTTP servers');
      return;
    }

    // Parse headers if provided
    let parsedHeaders: Record<string, string> | undefined;
    if (formData.headers.trim()) {
      try {
        parsedHeaders = JSON.parse(formData.headers.trim());
        if (typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
          toast.error('Headers must be a JSON object');
          return;
        }
      } catch {
        toast.error('Invalid JSON for headers');
        return;
      }
    }

    // Parse env if provided
    let parsedEnv: Record<string, string> | undefined;
    if (formData.env.trim()) {
      try {
        parsedEnv = JSON.parse(formData.env.trim());
        if (typeof parsedEnv !== 'object' || Array.isArray(parsedEnv)) {
          toast.error('Environment variables must be a JSON object');
          return;
        }
      } catch {
        toast.error('Invalid JSON for environment variables');
        return;
      }
    }

    const serverData: Omit<MCPServerConfig, 'id'> = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      type: formData.type,
      enabled: editingServer?.enabled ?? true,
    };

    if (formData.type === 'stdio') {
      serverData.command = formData.command.trim();
      if (formData.args.trim()) {
        serverData.args = formData.args.trim().split(/\s+/);
      }
      if (parsedEnv) {
        serverData.env = parsedEnv;
      }
    } else {
      serverData.url = formData.url.trim();
      if (parsedHeaders) {
        serverData.headers = parsedHeaders;
      }
    }

    // If editing an existing server, save directly (user already approved it)
    if (editingServer) {
      updateMCPServer(editingServer.id, serverData);
      toast.success('MCP server updated');
      await syncSettingsToServer();
      handleCloseDialog();
      return;
    }

    // For new servers, show security warning first
    setPendingServerData({
      type: 'add',
      serverData,
      serverType: formData.type,
      command: formData.type === 'stdio' ? formData.command.trim() : undefined,
      args:
        formData.type === 'stdio' && formData.args.trim()
          ? formData.args.trim().split(/\s+/)
          : undefined,
      url: formData.type !== 'stdio' ? formData.url.trim() : undefined,
    });
    setIsSecurityWarningOpen(true);
  };

  /** Called when user confirms the security warning for adding a server */
  const handleSecurityWarningConfirm = async () => {
    if (!pendingServerData) return;

    if (pendingServerData.type === 'add' && pendingServerData.serverData) {
      addMCPServer(pendingServerData.serverData);
      toast.success('MCP server added');
      await syncSettingsToServer();
      handleCloseDialog();
    } else if (pendingServerData.type === 'import' && pendingServerData.importServers) {
      for (const serverData of pendingServerData.importServers) {
        addMCPServer(serverData);
      }
      await syncSettingsToServer();
      const count = pendingServerData.importServers.length;
      toast.success(`Imported ${count} MCP server${count > 1 ? 's' : ''}`);
      setIsImportDialogOpen(false);
      setImportJson('');
    }

    setIsSecurityWarningOpen(false);
    setPendingServerData(null);
  };

  const handleToggleEnabled = async (server: MCPServerConfig) => {
    updateMCPServer(server.id, { enabled: !server.enabled });
    await syncSettingsToServer();
    toast.success(server.enabled ? 'Server disabled' : 'Server enabled');
  };

  const handleDelete = async (id: string) => {
    removeMCPServer(id);
    await syncSettingsToServer();
    setDeleteConfirmId(null);
    toast.success('MCP server removed');
  };

  const handleImportJson = async () => {
    try {
      const parsed = JSON.parse(importJson);

      // Support both formats:
      // 1. Claude Code format: { "mcpServers": { "name": { command, args, ... } } }
      // 2. Direct format: { "name": { command, args, ... } }
      const servers = parsed.mcpServers || parsed;

      if (typeof servers !== 'object' || Array.isArray(servers)) {
        toast.error('Invalid format: expected object with server configurations');
        return;
      }

      const serversToImport: Array<Omit<MCPServerConfig, 'id'>> = [];
      let skippedCount = 0;

      for (const [name, config] of Object.entries(servers)) {
        if (typeof config !== 'object' || config === null) continue;

        const serverConfig = config as Record<string, unknown>;

        // Check if server with this name already exists
        if (mcpServers.some((s) => s.name === name)) {
          skippedCount++;
          continue;
        }

        const serverData: Omit<MCPServerConfig, 'id'> = {
          name,
          type: (serverConfig.type as ServerType) || 'stdio',
          enabled: true,
        };

        if (serverData.type === 'stdio') {
          if (!serverConfig.command) {
            console.warn(`Skipping ${name}: no command specified`);
            skippedCount++;
            continue;
          }

          const rawCommand = serverConfig.command as string;

          // Support both formats:
          // 1. Separate command/args: { "command": "npx", "args": ["-y", "package"] }
          // 2. Inline args (Claude Desktop format): { "command": "npx -y package" }
          if (Array.isArray(serverConfig.args) && serverConfig.args.length > 0) {
            // Args provided separately
            serverData.command = rawCommand;
            serverData.args = serverConfig.args as string[];
          } else if (rawCommand.includes(' ')) {
            // Parse inline command string - split on spaces but preserve quoted strings
            const parts = rawCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [rawCommand];
            serverData.command = parts[0];
            if (parts.length > 1) {
              // Remove quotes from args
              serverData.args = parts.slice(1).map((arg) => arg.replace(/^["']|["']$/g, ''));
            }
          } else {
            serverData.command = rawCommand;
          }

          if (typeof serverConfig.env === 'object' && serverConfig.env !== null) {
            serverData.env = serverConfig.env as Record<string, string>;
          }
        } else {
          if (!serverConfig.url) {
            console.warn(`Skipping ${name}: no url specified`);
            skippedCount++;
            continue;
          }
          serverData.url = serverConfig.url as string;
          if (typeof serverConfig.headers === 'object' && serverConfig.headers !== null) {
            serverData.headers = serverConfig.headers as Record<string, string>;
          }
        }

        serversToImport.push(serverData);
      }

      if (skippedCount > 0) {
        toast.info(
          `Skipped ${skippedCount} server${skippedCount > 1 ? 's' : ''} (already exist or invalid)`
        );
      }

      if (serversToImport.length === 0) {
        toast.warning('No new servers to import');
        return;
      }

      // Show security warning before importing
      // Use the first server's type for the warning (most imports are stdio)
      const firstServer = serversToImport[0];
      setPendingServerData({
        type: 'import',
        importServers: serversToImport,
        serverType: firstServer.type || 'stdio',
        command: firstServer.type === 'stdio' ? firstServer.command : undefined,
        args: firstServer.type === 'stdio' ? firstServer.args : undefined,
        url: firstServer.type !== 'stdio' ? firstServer.url : undefined,
      });
      setIsSecurityWarningOpen(true);
    } catch (error) {
      toast.error('Invalid JSON: ' + (error instanceof Error ? error.message : 'Parse error'));
    }
  };

  const handleExportJson = () => {
    const exportData: Record<string, Record<string, unknown>> = {};

    for (const server of mcpServers) {
      const serverConfig: Record<string, unknown> = {
        type: server.type || 'stdio',
      };

      if (server.type === 'stdio' || !server.type) {
        serverConfig.command = server.command;
        if (server.args?.length) serverConfig.args = server.args;
        if (server.env && Object.keys(server.env).length > 0) serverConfig.env = server.env;
      } else {
        serverConfig.url = server.url;
        if (server.headers && Object.keys(server.headers).length > 0)
          serverConfig.headers = server.headers;
      }

      exportData[server.name] = serverConfig;
    }

    const json = JSON.stringify({ mcpServers: exportData }, null, 2);
    navigator.clipboard.writeText(json);
    toast.success('Copied to clipboard');
  };

  const handleOpenJsonEdit = (server: MCPServerConfig) => {
    // Build a clean config object for editing (excluding internal fields like id)
    const editableConfig: Record<string, unknown> = {
      name: server.name,
      type: server.type || 'stdio',
    };

    if (server.description) {
      editableConfig.description = server.description;
    }

    if (server.type === 'stdio' || !server.type) {
      if (server.command) editableConfig.command = server.command;
      if (server.args?.length) editableConfig.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) editableConfig.env = server.env;
    } else {
      if (server.url) editableConfig.url = server.url;
      if (server.headers && Object.keys(server.headers).length > 0) {
        editableConfig.headers = server.headers;
      }
    }

    if (server.enabled === false) {
      editableConfig.enabled = false;
    }

    setJsonEditValue(JSON.stringify(editableConfig, null, 2));
    setJsonEditServer(server);
  };

  const handleSaveJsonEdit = async () => {
    if (!jsonEditServer) return;

    try {
      const parsed = JSON.parse(jsonEditValue);

      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('Config must be a JSON object');
        return;
      }

      // Validate required fields based on type
      const serverType = parsed.type || 'stdio';

      if (!parsed.name || typeof parsed.name !== 'string') {
        toast.error('Name is required');
        return;
      }

      if (serverType === 'stdio') {
        if (!parsed.command || typeof parsed.command !== 'string') {
          toast.error('Command is required for stdio servers');
          return;
        }
      } else if (serverType === 'sse' || serverType === 'http') {
        if (!parsed.url || typeof parsed.url !== 'string') {
          toast.error('URL is required for SSE/HTTP servers');
          return;
        }
      }

      // Build update object
      const updateData: Partial<MCPServerConfig> = {
        name: parsed.name,
        type: serverType,
        description: parsed.description || undefined,
        enabled: parsed.enabled !== false,
      };

      if (serverType === 'stdio') {
        updateData.command = parsed.command;
        updateData.args = Array.isArray(parsed.args) ? parsed.args : undefined;
        updateData.env =
          typeof parsed.env === 'object' && !Array.isArray(parsed.env) ? parsed.env : undefined;
        // Clear HTTP fields
        updateData.url = undefined;
        updateData.headers = undefined;
      } else {
        updateData.url = parsed.url;
        updateData.headers =
          typeof parsed.headers === 'object' && !Array.isArray(parsed.headers)
            ? parsed.headers
            : undefined;
        // Clear stdio fields
        updateData.command = undefined;
        updateData.args = undefined;
        updateData.env = undefined;
      }

      updateMCPServer(jsonEditServer.id, updateData);
      await syncSettingsToServer();

      toast.success('Server configuration updated');
      setJsonEditServer(null);
      setJsonEditValue('');
    } catch (error) {
      toast.error('Invalid JSON: ' + (error instanceof Error ? error.message : 'Parse error'));
    }
  };

  const handleOpenGlobalJsonEdit = () => {
    // Build the full mcpServers config object
    const exportData: Record<string, Record<string, unknown>> = {};

    for (const server of mcpServers) {
      const serverConfig: Record<string, unknown> = {
        type: server.type || 'stdio',
      };

      if (server.description) {
        serverConfig.description = server.description;
      }

      if (server.enabled === false) {
        serverConfig.enabled = false;
      }

      if (server.type === 'stdio' || !server.type) {
        serverConfig.command = server.command;
        if (server.args?.length) serverConfig.args = server.args;
        if (server.env && Object.keys(server.env).length > 0) serverConfig.env = server.env;
      } else {
        serverConfig.url = server.url;
        if (server.headers && Object.keys(server.headers).length > 0) {
          serverConfig.headers = server.headers;
        }
      }

      exportData[server.name] = serverConfig;
    }

    setGlobalJsonValue(JSON.stringify({ mcpServers: exportData }, null, 2));
    setIsGlobalJsonEditOpen(true);
  };

  const handleSaveGlobalJsonEdit = async () => {
    try {
      const parsed = JSON.parse(globalJsonValue);

      // Support both formats
      const servers = parsed.mcpServers || parsed;

      if (typeof servers !== 'object' || Array.isArray(servers)) {
        toast.error('Invalid format: expected object with server configurations');
        return;
      }

      // Validate all servers first
      for (const [name, config] of Object.entries(servers)) {
        if (typeof config !== 'object' || config === null) {
          toast.error(`Invalid config for "${name}"`);
          return;
        }

        const serverConfig = config as Record<string, unknown>;
        const serverType = (serverConfig.type as string) || 'stdio';

        if (serverType === 'stdio') {
          if (!serverConfig.command || typeof serverConfig.command !== 'string') {
            toast.error(`Command is required for "${name}" (stdio)`);
            return;
          }
        } else if (serverType === 'sse' || serverType === 'http') {
          if (!serverConfig.url || typeof serverConfig.url !== 'string') {
            toast.error(`URL is required for "${name}" (${serverType})`);
            return;
          }
        }
      }

      // Create a map of existing servers by name for updating
      const existingByName = new Map(mcpServers.map((s) => [s.name, s]));
      const processedNames = new Set<string>();

      // Update or add servers
      for (const [name, config] of Object.entries(servers)) {
        const serverConfig = config as Record<string, unknown>;
        const serverType = (serverConfig.type as ServerType) || 'stdio';

        const serverData: Omit<MCPServerConfig, 'id'> = {
          name,
          type: serverType,
          description: (serverConfig.description as string) || undefined,
          enabled: serverConfig.enabled !== false,
        };

        if (serverType === 'stdio') {
          serverData.command = serverConfig.command as string;
          if (Array.isArray(serverConfig.args)) {
            serverData.args = serverConfig.args as string[];
          }
          if (typeof serverConfig.env === 'object' && serverConfig.env !== null) {
            serverData.env = serverConfig.env as Record<string, string>;
          }
        } else {
          serverData.url = serverConfig.url as string;
          if (typeof serverConfig.headers === 'object' && serverConfig.headers !== null) {
            serverData.headers = serverConfig.headers as Record<string, string>;
          }
        }

        const existing = existingByName.get(name);
        if (existing) {
          updateMCPServer(existing.id, serverData);
        } else {
          addMCPServer(serverData);
        }
        processedNames.add(name);
      }

      // Remove servers that are no longer in the JSON
      for (const server of mcpServers) {
        if (!processedNames.has(server.name)) {
          removeMCPServer(server.id);
        }
      }

      await syncSettingsToServer();

      toast.success('MCP servers configuration updated');
      setIsGlobalJsonEditOpen(false);
      setGlobalJsonValue('');
    } catch (error) {
      toast.error('Invalid JSON: ' + (error instanceof Error ? error.message : 'Parse error'));
    }
  };

  return {
    // Store state
    mcpServers,
    mcpAutoApproveTools,
    mcpUnrestrictedTools,
    setMcpAutoApproveTools,
    setMcpUnrestrictedTools,

    // Dialog state
    isAddDialogOpen,
    setIsAddDialogOpen,
    editingServer,
    formData,
    setFormData,
    deleteConfirmId,
    setDeleteConfirmId,
    isImportDialogOpen,
    setIsImportDialogOpen,
    importJson,
    setImportJson,
    jsonEditServer,
    setJsonEditServer,
    jsonEditValue,
    setJsonEditValue,
    isGlobalJsonEditOpen,
    setIsGlobalJsonEditOpen,
    globalJsonValue,
    setGlobalJsonValue,

    // Security warning dialog state
    isSecurityWarningOpen,
    setIsSecurityWarningOpen,
    pendingServerData,

    // UI state
    isRefreshing,
    serverTestStates,
    expandedServers,

    // Computed
    totalToolsCount,
    showToolsWarning,

    // Handlers
    handleRefresh,
    handleTestServer,
    toggleServerExpanded,
    handleOpenAddDialog,
    handleOpenEditDialog,
    handleCloseDialog,
    handleSave,
    handleToggleEnabled,
    handleDelete,
    handleImportJson,
    handleExportJson,
    handleOpenJsonEdit,
    handleSaveJsonEdit,
    handleOpenGlobalJsonEdit,
    handleSaveGlobalJsonEdit,
    handleSecurityWarningConfirm,
  };
}
