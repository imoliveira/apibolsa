# 🔍 Como Validar se está usando Data Grid

## ✅ Status Atual

- ✅ **Data Grid Cluster**: Running (apibolsa-cache-0)
- ✅ **Services**: Criados (porta 11222)
- ✅ **ConfigMap**: Variáveis configuradas
- ⚠️ **Conexão**: Ainda usando cache local (fallback)

## 🧪 Métodos de Validação

### 1. Script Automatizado (Recomendado)

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/datagrid
./validar-datagrid.sh
```

### 2. Testar Cache via API

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/datagrid
./testar-cache.sh
```

### 3. Validação Manual

#### A. Verificar Status do Cluster
```bash
oc get infinispan -n apibolsa
oc get pods -n apibolsa | grep apibolsa-cache
```

**Esperado**: Pod `apibolsa-cache-0` em status `Running (1/1)`

#### B. Verificar Logs do Node.js
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs --tail=20 | grep -i "datagrid\|cache"
```

**Indicadores**:
- ✅ **Usando Data Grid**: Sem mensagens de "⚠️" ou "cache local"
- ⚠️ **Usando cache local**: Mensagens como "⚠️ Data Grid não disponível, usando cache local"

#### C. Testar API de Status (requer login)
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Status do cache
curl http://$ROUTE/api/cache/status -b cookies.txt | jq '.'
```

**Esperado**:
```json
{
  "success": true,
  "cache": {
    "type": "Data Grid",  // ✅ Se estiver usando
    "enabled": true,
    "url": "http://apibolsa-cache:11222"
  }
}
```

#### D. Testar Funcionalidade de Cache
```bash
# Primeira chamada
curl -s http://$ROUTE/api/test-connection -b cookies.txt | jq '.fromCache'
# Esperado: false

# Segunda chamada (deve vir do cache)
curl -s http://$ROUTE/api/test-connection -b cookies.txt | jq '.fromCache'
# Esperado: true
```

## 📊 Indicadores de Sucesso

### ✅ Data Grid Funcionando
- [ ] Pod `apibolsa-cache-0` em `Running`
- [ ] Service `apibolsa-cache` na porta 11222
- [ ] Logs **sem** mensagens "⚠️" ou "cache local"
- [ ] API `/api/cache/status` retorna `"type": "Data Grid"`
- [ ] Teste de cache retorna `fromCache: true` na segunda chamada

### ⚠️ Usando Cache Local (Fallback)
- [ ] Logs mostram "⚠️ Data Grid não disponível, usando cache local"
- [ ] API retorna `"type": "Local"`
- [ ] Cache ainda funciona, mas apenas em memória local

## 🔧 Troubleshooting

### Problema: "socket hang up"

**Causa**: Timeout ou Data Grid ainda não está pronto

**Solução**:
1. Aguardar pod ficar totalmente pronto:
   ```bash
   oc wait --for=condition=Ready pod/apibolsa-cache-0 -n apibolsa --timeout=300s
   ```

2. Verificar se Data Grid está respondendo:
   ```bash
   oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa
   # Em outro terminal:
   curl -u developer:developer http://localhost:11222/rest/v2/caches
   ```

3. Verificar credenciais:
   ```bash
   SECRET=$(oc get infinispan apibolsa-cache -n apibolsa -o jsonpath='{.status.security.endpointSecretName}')
   oc get secret $SECRET -n apibolsa -o yaml
   ```

### Problema: Variáveis de ambiente não aplicadas

**Solução**:
```bash
# Verificar ConfigMap
oc get configmap nodejs-config -n apibolsa -o yaml | grep DATAGRID

# Reiniciar deployment
oc rollout restart deployment/nodejs -n apibolsa
```

## 📝 Checklist Rápido

Execute este checklist para validar:

```bash
# 1. Cluster está Running?
oc get pods -n apibolsa | grep apibolsa-cache

# 2. Service existe?
oc get svc apibolsa-cache -n apibolsa

# 3. Variáveis configuradas?
oc get configmap nodejs-config -n apibolsa | grep DATAGRID

# 4. Testar conectividade
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv apibolsa-cache 11222

# 5. Ver logs
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs --tail=10 | grep cache
```

## 🎯 Resultado Esperado

Quando tudo estiver funcionando, você verá:

1. **Logs**: Sem mensagens de erro, apenas "📦 Dados obtidos do cache"
2. **API Status**: `"type": "Data Grid"`
3. **Performance**: Segunda chamada retorna `fromCache: true`
4. **Conectividade**: Node.js consegue acessar `http://apibolsa-cache:11222`

## 📚 Arquivos de Referência

- `validar-datagrid.sh` - Script completo de validação
- `testar-cache.sh` - Script para testar funcionalidade
- `COMO-VALIDAR.md` - Documentação detalhada
- `STATUS.md` - Status atual da configuração



