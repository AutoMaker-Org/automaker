# Plano de Implementação - Correções MCP Servers

## Resumo Executivo

Implementar correções para três bugs críticos nos servidores MCP do Automaker, seguindo estratégia híbrida de curto/médio/longo prazo com foco em manutenibilidade para futuras atualizações do repositório.

## Bugs Identificados

### 🔴 Bug #1: Formato JSON Inconsistente (Array vs Objeto)

- **Local**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts:573-603`
- **Problema**: `handleOpenGlobalJsonEdit()` converte array para objeto, perdendo IDs dos servidores
- **Impacto**: Backend não encontra servidores após edição JSON, quebra persistência
- **Prioridade**: 3 (corrigir por último)

### 🔴 Bug #2: Falta de Tratamento de Erros HTTP

- **Local**: `apps/ui/src/lib/http-api-client.ts:165-195`
- **Problema**: Sem verificação de `response.ok` antes de `.json()`
- **Impacto**: Erros crípticos ("Unexpected end of JSON input") ao invés de mensagens claras
- **Prioridade**: 1 (corrigir primeiro - fundação para debugging)

### 🔴 Bug #3: Race Condition no Auto-Test

- **Local**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts:133-147, 300-322`
- **Problema**: Auto-test executa antes de `syncSettingsToServer()` completar
- **Impacto**: "Server not found" imediatamente após adicionar servidor
- **Prioridade**: 2 (corrigir segundo - garante IDs estáveis)

---

## FASE 1: CURTO PRAZO (Esta Semana)

### Objetivo

Aplicar correções localmente, documentar e criar patches para re-aplicação futura.

### 1.1 Corrigir Bug #2 - HTTP Error Handling (PRIMEIRO)

**Arquivo**: `apps/ui/src/lib/http-api-client.ts`

**Mudanças** (linhas 165-195):

Adicionar verificação de `response.ok` em TODOS os métodos HTTP:

```typescript
// Aplicar este padrão em: post(), get(), put(), httpDelete()

private async post<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${this.serverUrl}${endpoint}`, {
    method: 'POST',
    headers: this.getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  // ✅ ADICIONAR ESTA VERIFICAÇÃO
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Se parsing JSON falhar, usar status text
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
```

**Validação**:

- [ ] Erro 404 mostra "Server not found" (não "Unexpected end of JSON input")
- [ ] Erro 500 mostra mensagem do servidor
- [ ] Chamadas bem-sucedidas continuam funcionando

---

### 1.2 Corrigir Bug #3 - Race Condition (SEGUNDO)

**Arquivo**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`

**Mudanças** (linhas 300-335):

Aguardar `syncSettingsToServer()` completar antes de mostrar sucesso:

```typescript
// ANTES (linha 301-308):
const handleSecurityWarningConfirm = async () => {
  if (pendingServerData.type === 'add') {
    addMCPServer(pendingServerData.serverData);
    toast.success('MCP server added'); // ❌ Mostra antes do sync
    await syncSettingsToServer();
    handleCloseDialog();
  }
};

// DEPOIS:
const handleSecurityWarningConfirm = async () => {
  if (pendingServerData.type === 'add') {
    addMCPServer(pendingServerData.serverData);

    // ✅ AGUARDAR SYNC COMPLETAR
    const syncSuccess = await syncSettingsToServer();

    if (!syncSuccess) {
      toast.error('Failed to save MCP server to disk');
      return;
    }

    toast.success('MCP server added'); // ✅ Só mostra após sync
    handleCloseDialog();
  }
};
```

**Aplicar mesmo padrão em**:

- `handleSave()` (linha ~280)
- `handleToggleEnabled()` (linha ~326)
- `handleDelete()` (linha ~331)

**Validação**:

- [ ] Toast de sucesso aparece APÓS sync completar
- [ ] Auto-test não falha com "Server not found"
- [ ] Erro mostrado se sync falhar

---

### 1.3 Corrigir Bug #1 - JSON Format (TERCEIRO)

**Arquivo**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`

**Mudanças** (linhas 571-604):

Exportar como array com IDs ao invés de objeto:

```typescript
// ANTES (linha 573-603):
const handleOpenGlobalJsonEdit = () => {
  const exportData: Record<string, Record<string, unknown>> = {};  // ❌ OBJETO

  for (const server of mcpServers) {
    const serverConfig = { type: server.type, command: server.command, ... };
    exportData[server.name] = serverConfig;  // ❌ USA NOME COMO CHAVE, PERDE ID
  }

  setGlobalJsonValue(JSON.stringify({ mcpServers: exportData }, null, 2));
};

// DEPOIS:
const handleOpenGlobalJsonEdit = () => {
  const serversArray = mcpServers.map((server) => {  // ✅ ARRAY
    return {
      id: server.id,          // ✅ PRESERVA ID
      name: server.name,      // ✅ PRESERVA NAME
      type: server.type || 'stdio',
      description: server.description,
      enabled: server.enabled !== false,
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      headers: server.headers,
    };
  });

  setGlobalJsonValue(JSON.stringify({ mcpServers: serversArray }, null, 2));  // ✅ ARRAY FORMAT
};
```

**Mudanças adicionais** (linhas 606-696 - `handleSaveGlobalJsonEdit`):

Suportar AMBOS formatos (array E objeto) para compatibilidade:

```typescript
const handleSaveGlobalJsonEdit = async () => {
  const parsed = JSON.parse(globalJsonValue);
  const servers = parsed.mcpServers || parsed;

  // ✅ SUPORTAR ARRAY E OBJETO
  if (Array.isArray(servers)) {
    await handleSaveGlobalJsonArray(servers); // Novo helper
  } else if (typeof servers === 'object') {
    await handleSaveGlobalJsonObject(servers); // Lógica existente (renomear)
  } else {
    toast.error('Invalid format');
  }
};

// Criar helper para processar array format
const handleSaveGlobalJsonArray = async (serversArray: unknown[]) => {
  // Validar servers
  // Atualizar por ID (se presente) ou nome
  // Remover servers não na lista
  // Sync to server
};
```

**Validação**:

- [ ] JSON editor mostra formato array com IDs
- [ ] Editar e salvar preserva IDs
- [ ] Formato objeto (Claude Desktop) ainda funciona
- [ ] Arquivo `settings.json` tem formato array
- [ ] Teste de servidor funciona após edição JSON

---

### 1.4 Documentar em CUSTOM_CHANGES.md

**Novo Arquivo**: `N:\code\automaker-app\CUSTOM_CHANGES.md`

Estrutura:

```markdown
# Custom Changes to Automaker

## MCP Server Bug Fixes

### Bug #1: HTTP Error Handling

**Files**: `apps/ui/src/lib/http-api-client.ts`
**Changes**: [código antes/depois]

### Bug #2: Race Condition

**Files**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`
**Changes**: [código antes/depois]

### Bug #3: JSON Format

**Files**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`
**Changes**: [código antes/depois]

## Re-applying After Updates

[Instruções de re-aplicação via patches]

## Testing Checklist

[Checklist completo de validação]
```

---

### 1.5 Criar Git Patches

```bash
# Criar diretório de patches
mkdir -p patches

# Criar patches individuais
git diff apps/ui/src/lib/http-api-client.ts > patches/01-fix-http-error-handling.patch
git diff apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts > patches/02-fix-race-condition-and-json-format.patch

# Patch combinado
git diff > patches/mcp-fixes-combined-2025-12-29.patch

# Commitar documentação (NÃO o código)
git add patches/ CUSTOM_CHANGES.md
git commit -m "docs: document MCP server bug fixes and patches"
```

---

### 1.6 Checklist Curto Prazo

- [ ] Bug #2 corrigido (HTTP error handling)
- [ ] Bug #3 corrigido (race condition)
- [ ] Bug #1 corrigido (JSON format)
- [ ] CUSTOM_CHANGES.md criado
- [ ] Patches criados em `patches/`
- [ ] Testes manuais passando
- [ ] Documentação commitada

---

## FASE 2: MÉDIO PRAZO (Próximas 2-4 Semanas)

### Objetivo

Abrir issues no GitHub, preparar Pull Requests com testes, submeter para revisão.

### 2.1 Criar GitHub Issues (Semana 1)

**Issue #1**: HTTP Error Handling in API Client

- Label: `bug`, `dx`, `api-client`, `good-first-issue`
- Template disponível em `MCP_MAINTENANCE_STRATEGY.md`

**Issue #2**: Race Condition in MCP Server Auto-Test

- Label: `bug`, `ux`, `mcp-servers`, `electron`

**Issue #3**: MCP Servers JSON Format Inconsistency

- Label: `bug`, `data-integrity`, `mcp-servers`

---

### 2.2 Preparar Pull Requests (Semana 2-3)

**PR #1: Fix HTTP Error Handling**

- Código do Bug #2
- Unit tests: `apps/ui/src/lib/http-api-client.test.ts`
- Integration test: Playwright E2E

**PR #2: Fix Race Condition in MCP Auto-Test**

- Código do Bug #3
- Unit tests: `use-mcp-servers.test.tsx`
- Integration test: Playwright timing test

**PR #3: Fix JSON Format Inconsistency**

- Código do Bug #1
- Unit tests: JSON export/import tests
- Integration test: Playwright JSON editor test

**Requisitos para cada PR**:

- [ ] Código implementado e testado
- [ ] Unit tests com cobertura >80%
- [ ] Integration tests (Playwright)
- [ ] Screenshots/GIFs demonstrando fix
- [ ] Descrição clara (problema, solução, impacto)
- [ ] CI/CD passando

---

### 2.3 Submeter PRs (Semana 4)

1. Abrir PRs no GitHub
2. Responder feedback de revisores
3. Fazer ajustes solicitados
4. Aguardar merge

---

## FASE 3: LONGO PRAZO (Após 2 Meses)

### Cenário A: PRs Aceitos ✅

**Ações**:

1. Atualizar do upstream: `git pull upstream main`
2. Remover patches: `rm -rf patches/`
3. Atualizar CUSTOM_CHANGES.md indicando merge
4. Commit cleanup

---

### Cenário B: PRs Rejeitados ou Estagnados ❌

**Opção 1: Manter Patches (RECOMENDADO)**

```bash
# Após cada update do upstream
git pull upstream main
git apply patches/*.patch
# Resolver conflitos se necessário
npm run build && npm run test
```

**Vantagens**:

- Recebe updates do upstream
- Mantém correções locais
- Fácil de manter

**Desvantagens**:

- Requer re-aplicação manual
- Patches podem conflitar

---

**Opção 2: Fork Permanente**

- Criar fork: `your-username/automaker`
- Aplicar fixes diretamente
- Sincronizar periodicamente com upstream
- Usar para distribuição interna

**Vantagens**:

- Controle total
- Sem re-aplicação de patches

**Desvantagens**:

- Divergência do upstream
- Manutenção contínua necessária

---

## Arquivos Críticos

### 1. `apps/ui/src/lib/http-api-client.ts`

- **Bug**: #2 (HTTP Error Handling)
- **Linhas**: 165-195
- **Mudança**: Adicionar `response.ok` check

### 2. `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`

- **Bugs**: #1 (JSON Format), #3 (Race Condition)
- **Linhas**: 133-147 (auto-test), 300-335 (security confirm), 571-696 (JSON editor)
- **Mudanças**: Aguardar sync, exportar como array

### 3. `apps/ui/src/hooks/use-settings-migration.ts`

- **Referência**: `syncSettingsToServer()` usado no Bug #3
- **Entendimento**: Sem modificações, mas importante para timing

### 4. `CUSTOM_CHANGES.md` (NOVO)

- **Propósito**: Documentação de todas as mudanças
- **Conteúdo**: Código antes/depois, instruções de re-aplicação

### 5. `patches/` (NOVO DIRETÓRIO)

- **Propósito**: Patches git para re-aplicação
- **Arquivos**:
  - `01-fix-http-error-handling.patch`
  - `02-fix-race-condition-and-json-format.patch`
  - `mcp-fixes-combined-2025-12-29.patch`

---

## Ordem de Execução (CRÍTICA)

**DEVE ser executado nesta ordem**:

1. ✅ Bug #2 (HTTP Error Handling) - PRIMEIRO
   - Fundação para debugging
   - Sem dependências

2. ✅ Bug #3 (Race Condition) - SEGUNDO
   - Requer Bug #2 para ver erros de sync
   - Garante IDs estáveis

3. ✅ Bug #1 (JSON Format) - TERCEIRO
   - Requer Bugs #2 e #3 para funcionar corretamente
   - Depende de IDs estáveis

**Tarefas paralelas**:

- Documentação (CUSTOM_CHANGES.md)
- Criação de patches
- Escrita de issues (rascunhos)

---

## Rollback Plan

### Se algo quebrar:

```bash
# Backup antes de aplicar
git checkout -b pre-mcp-fixes
cp data/settings.json data/settings.json.backup

# Reverter se necessário
git checkout pre-mcp-fixes
cp data/settings.json.backup data/settings.json
npm run build
```

---

## Validação Final

**Antes de considerar completo**:

### Testes Funcionais

- [ ] HTTP errors mostram mensagens claras
- [ ] Adicionar servidor espera sync antes de testar
- [ ] Editar JSON preserva IDs dos servidores
- [ ] Formato objeto (Claude Desktop) ainda funciona

### Testes de Compatibilidade

- [ ] Todos os testes unitários passam: `npm run test:server`
- [ ] Todos os testes E2E passam: `npm run test`
- [ ] Build completa sem erros: `npm run build`
- [ ] App funciona em modo web: `npm run dev:web`
- [ ] App funciona em modo Electron: `npm run dev:electron`

### Documentação

- [ ] CUSTOM_CHANGES.md completo e preciso
- [ ] Patches funcionam quando re-aplicados
- [ ] README atualizado (se mantiver fork)

---

## Notas Importantes

1. **Prioridade de Correção**: A ordem Bug #2 → #3 → #1 é OBRIGATÓRIA
2. **Compatibilidade**: Manter suporte para formato objeto (Claude Desktop legacy)
3. **Sem Breaking Changes**: Todas as correções são backward-compatible
4. **Performance**: Impacto mínimo (~50-200ms em operações de save)
5. **Comunidade**: PRs beneficiam todos os usuários do Automaker

---

## Próximos Passos Imediatos

1. Revisar e aprovar este plano
2. Aplicar Bug #2 (HTTP Error Handling)
3. Testar Bug #2 extensivamente
4. Aplicar Bug #3 (Race Condition)
5. Testar Bug #3 extensivamente
6. Aplicar Bug #1 (JSON Format)
7. Testar integração completa
8. Criar documentação e patches
9. Commitar documentação (não código)

**Tempo Estimado Fase 1**: 3-5 horas de implementação + 2-3 horas de testes
