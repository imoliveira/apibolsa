# 🔥 Status - Data Grid Cache

## ✅ Configuração Aplicada

### 1. Infinispan Cluster
- **Nome**: `apibolsa-cache`
- **Tipo**: DataGrid
- **Status**: Criado (aguardando pods ficarem prontos)

### 2. Cache Configuration
- **Nome**: `apibolsa-cache-config`
- **Cache**: `default`
- **Status**: Criado

### 3. Node.js
- ✅ Código atualizado com suporte a cache
- ✅ Dependências instaladas (`node-cache`, `axios`)
- ✅ Variáveis de ambiente configuradas
- ✅ Fallback para cache local se Data Grid não disponível

## 🔍 Verificar Status

### Cluster
```bash
oc get infinispan -n apibolsa
oc describe infinispan apibolsa-cache -n apibolsa
```

### Pods
```bash
oc get pods -n apibolsa | grep apibolsa-cache
oc logs apibolsa-cache-0 -n apibolsa
```

### Services
```bash
oc get svc -n apibolsa | grep apibolsa-cache
```

### Cache
```bash
oc get cache -n apibolsa
```

## ⏳ Próximos Passos

1. **Aguardar cluster ficar Ready**
   ```bash
   oc wait --for=condition=Ready infinispan/apibolsa-cache -n apibolsa --timeout=300s
   ```

2. **Obter credenciais**
   ```bash
   SECRET=$(oc get infinispan apibolsa-cache -n apibolsa -o jsonpath='{.status.security.endpointSecretName}')
   oc get secret $SECRET -n apibolsa -o yaml
   ```

3. **Testar conexão**
   ```bash
   oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa
   # Em outro terminal:
   curl -u developer:developer http://localhost:11222/rest/v2/caches
   ```

4. **Verificar na aplicação**
   ```bash
   oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "Data Grid\|cache"
   ```

## 🔧 Configuração Atual

### Variáveis de Ambiente (Node.js)
- `DATAGRID_ENABLED`: `true`
- `DATAGRID_URL`: `http://apibolsa-cache:11222`
- `DATAGRID_USER`: `developer`
- `DATAGRID_PASSWORD`: `developer`

### Funcionalidades Implementadas
- ✅ Cache de teste de conexão (5 min)
- ✅ Cache de usuários (30 min)
- ✅ Rate limiting de login (5 tentativas)
- ✅ APIs de gerenciamento de cache

## 📝 Notas

- O sistema usa **cache local** como fallback se Data Grid não estiver disponível
- Cache local é em memória (perdido ao reiniciar pod)
- Data Grid permite cache distribuído entre pods



