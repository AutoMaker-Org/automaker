import { Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMCPServers } from './hooks';
import { MCPServerHeader, MCPToolsWarning, MCPServerCard } from './components';
import {
  AddEditServerDialog,
  DeleteServerDialog,
  ImportJsonDialog,
  JsonEditDialog,
  GlobalJsonEditDialog,
  SecurityWarningDialog,
} from './dialogs';

export function MCPServersSection() {
  const {
    // Store state
    mcpServers,

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
  } = useMCPServers();

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <MCPServerHeader
        isRefreshing={isRefreshing}
        hasServers={mcpServers.length > 0}
        onRefresh={handleRefresh}
        onExport={handleExportJson}
        onEditAllJson={handleOpenGlobalJsonEdit}
        onImport={() => setIsImportDialogOpen(true)}
        onAdd={handleOpenAddDialog}
      />

      {showToolsWarning && <MCPToolsWarning totalTools={totalToolsCount} />}

      <div className="p-6">
        {mcpServers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No MCP servers configured</p>
            <p className="text-xs mt-1">Add a server to extend agent capabilities</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((server) => (
              <MCPServerCard
                key={server.id}
                server={server}
                testState={serverTestStates[server.id]}
                isExpanded={expandedServers.has(server.id)}
                onToggleExpanded={() => toggleServerExpanded(server.id)}
                onTest={() => handleTestServer(server)}
                onToggleEnabled={() => handleToggleEnabled(server)}
                onEditJson={() => handleOpenJsonEdit(server)}
                onEdit={() => handleOpenEditDialog(server)}
                onDelete={() => setDeleteConfirmId(server.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddEditServerDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        editingServer={editingServer}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        onCancel={handleCloseDialog}
      />

      <DeleteServerDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => setDeleteConfirmId(open ? deleteConfirmId : null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
      />

      <ImportJsonDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        importJson={importJson}
        onImportJsonChange={setImportJson}
        onImport={handleImportJson}
        onCancel={() => {
          setIsImportDialogOpen(false);
          setImportJson('');
        }}
      />

      <JsonEditDialog
        open={!!jsonEditServer}
        onOpenChange={(open) => {
          if (!open) {
            setJsonEditServer(null);
            setJsonEditValue('');
          }
        }}
        server={jsonEditServer}
        jsonValue={jsonEditValue}
        onJsonValueChange={setJsonEditValue}
        onSave={handleSaveJsonEdit}
        onCancel={() => {
          setJsonEditServer(null);
          setJsonEditValue('');
        }}
      />

      <GlobalJsonEditDialog
        open={isGlobalJsonEditOpen}
        onOpenChange={setIsGlobalJsonEditOpen}
        jsonValue={globalJsonValue}
        onJsonValueChange={setGlobalJsonValue}
        onSave={handleSaveGlobalJsonEdit}
        onCancel={() => {
          setIsGlobalJsonEditOpen(false);
          setGlobalJsonValue('');
        }}
      />

      <SecurityWarningDialog
        open={isSecurityWarningOpen}
        onOpenChange={setIsSecurityWarningOpen}
        onConfirm={handleSecurityWarningConfirm}
        serverType={pendingServerData?.serverType || 'stdio'}
        serverName={pendingServerData?.serverData?.name || ''}
        command={pendingServerData?.command}
        args={pendingServerData?.args}
        url={pendingServerData?.url}
        importCount={
          pendingServerData?.type === 'import' ? pendingServerData.importServers?.length : undefined
        }
      />
    </div>
  );
}
