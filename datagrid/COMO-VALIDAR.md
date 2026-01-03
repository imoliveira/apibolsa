# 🔍 Como Validar se está usando Data Grid

## 📋 Métodos de Validação

### 1. ✅ Verificar Status do Cluster

```bash
# Status do Infinispan
oc get infinispan -n apibolsa

# Detalhes do cluster
oc describe infinispan apibolsa-cache -n apibolsa

# Verificar se está Ready
oc get infinispan apibolsa-cache -n apibolsa -o jsonpath='{.status.conditions[?(@.type=="WellFormed")].status}'
```

**Resultado esperado**: `True`

### 2. ✅ Verificar Pods do Data Grid

```bash
# Ver pods
oc get pods -n apibolsa | grep apibolsa-cache

# Ver logs
oc logs apibolsa-cache-0 -n apibolsa --tail=20
```

**Resultado esperado**: Pod em status `Running` (1/1)

### 3. ✅ Verificar Services

```bash
oc get svc -n apibolsa | grep apibolsa-cache
```

**Resultado esperado**: 
- `apibolsa-cache` (ClusterIP, porta 11222)
- `apibolsa-cache-admin` (ClusterIP, porta 11223)
- `apibolsa-cache-ping` (ClusterIP, porta 8888)

### 4. ✅ Testar Conectividade do Node.js

```bash
# Obter pod do Node.js
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')

# Testar acesso ao Data Grid
oc exec $NODEJS_POD -n apibolsa -c nodejs -- wget -qO- --timeout=3 http://apibolsa-cache:11222/rest/v2/caches
```

**Resultado esperado**: Lista de caches ou erro de autenticação (mas não timeout)

### 5. ✅ Verificar Variáveis de Ambiente

```bash
# Ver configuração do deployment
oc get deployment nodejs -n apibolsa -o yaml | grep -A 5 "DATAGRID"

# Ou via jsonpath
oc get deployment nodejs -n apibolsa -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DATAGRID_ENABLED")]}'
```

**Resultado esperado**:
- `DATAGRID_ENABLED: "true"`
- `DATAGRID_URL: "http://apibolsa-cache:11222"`
- `DATAGRID_USER: "developer"`

### 6. ✅ Verificar Logs do Node.js

```bash
# Ver logs recentes
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs --tail=50 | grep -i "datagrid\|cache"

# Procurar por mensagens específicas
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep "⚠️\|Data Grid\|cache local"
```

**Resultado esperado**:
- ✅ **Usando Data Grid**: Sem mensagens de "cache local" ou "⚠️"
- ⚠️ **Usando cache local**: Mensagens como "⚠️ Data Grid não disponível, usando cache local"

### 7. ✅ Testar API de Status do Cache

```bash
# Obter URL
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Fazer login primeiro
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Verificar status do cache
curl http://$ROUTE/api/cache/status -b cookies.txt | jq '.'
```

**Resultado esperado**:
```json
{
  "success": true,
  "cache": {
    "type": "Data Grid",  // ✅ Se estiver usando Data Grid
    "enabled": true,
    "url": "http://apibolsa-cache:11222",
    "stats": { ... }
  }
}
```

**Se estiver usando cache local**:
```json
{
  "cache": {
    "type": "Local",  // ⚠️ Cache local
    "enabled": false,
    "url": "local"
  }
}
```

### 8. ✅ Testar Funcionalidade de Cache

```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Primeira chamada (busca do banco)
echo "=== Primeira chamada ==="
curl -s http://$ROUTE/api/test-connection | jq '.fromCache'

# Segunda chamada (deve vir do cache)
echo "=== Segunda chamada (deve vir do cache) ==="
curl -s http://$ROUTE/api/test-connection | jq '.fromCache'
```

**Resultado esperado**:
- Primeira: `fromCache: false`
- Segunda: `fromCache: true` (se cache funcionando)

### 9. ✅ Testar Diretamente no Data Grid

```bash
# Port forward
oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa

# Em outro terminal, testar REST API
curl -u developer:developer http://localhost:11222/rest/v2/caches

# Ver cache específico
curl -u developer:developer http://localhost:11222/rest/v2/caches/default

# Ver chaves no cache
curl -u developer:developer http://localhost:11222/rest/v2/caches/default?action=keys
```

## 🎯 Script Automatizado

Use o script de validação:

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/datagrid
./validar-datagrid.sh
```

## 📊 Indicadores de Sucesso

### ✅ Data Grid Funcionando
- Cluster Infinispan em status `Ready`
- Pod `apibolsa-cache-0` em `Running`
- Service `apibolsa-cache` disponível
- Logs do Node.js **sem** mensagens de "cache local"
- API `/api/cache/status` retorna `"type": "Data Grid"`
- Testes de cache retornam `fromCache: true` na segunda chamada

### ⚠️ Usando Cache Local (Fallback)
- Logs mostram: "⚠️ Data Grid não disponível, usando cache local"
- API `/api/cache/status` retorna `"type": "Local"`
- Pod do Data Grid não está Running ou não existe

## 🐛 Troubleshooting

### Data Grid não está sendo usado

1. **Verificar se pod está Running**
   ```bash
   oc get pods -n apibolsa | grep apibolsa-cache
   oc describe pod apibolsa-cache-0 -n apibolsa
   ```

2. **Verificar conectividade**
   ```bash
   oc exec deployment/nodejs -n apibolsa -- nc -zv apibolsa-cache 11222
   ```

3. **Verificar variáveis de ambiente**
   ```bash
   oc get deployment nodejs -n apibolsa -o yaml | grep DATAGRID
   ```

4. **Verificar credenciais**
   ```bash
   SECRET=$(oc get infinispan apibolsa-cache -n apibolsa -o jsonpath='{.status.security.endpointSecretName}')
   oc get secret $SECRET -n apibolsa -o yaml
   ```

## 📝 Checklist de Validação

- [ ] Infinispan Cluster criado e Ready
- [ ] Pod apibolsa-cache-0 Running
- [ ] Services criados (apibolsa-cache na porta 11222)
- [ ] Variáveis de ambiente configuradas no Node.js
- [ ] Node.js consegue acessar Data Grid (sem timeout)
- [ ] Logs não mostram "cache local"
- [ ] API `/api/cache/status` retorna "Data Grid"
- [ ] Teste de cache funciona (segunda chamada vem do cache)



