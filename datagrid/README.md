# 🔥 Data Grid - Configuração de Cache

## 📋 Visão Geral

Este diretório contém a configuração para usar o **Red Hat Data Grid Operator** como sistema de cache distribuído para a aplicação API Bolsa.

## 🎯 O que foi implementado

### 1. Infinispan Cluster
- Cluster Data Grid com 1 réplica
- Configurado para uso como cache
- Recursos: 500m CPU, 512Mi memória

### 2. Cache Configuration
- Cache distribuído chamado "default"
- TTL: 1 hora (3600000ms)
- Max Idle: 30 minutos (1800000ms)
- Limite: 1000 objetos

### 3. Integração Node.js
- Cache híbrido: Data Grid (se disponível) ou cache local (fallback)
- Cache de conexões de banco de dados
- Cache de usuários para login
- Rate limiting de tentativas de login
- APIs para gerenciar cache

## 🚀 Deploy

### Método Automatizado

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/datagrid
./deploy-datagrid.sh
```

### Método Manual

```bash
# 1. Criar Infinispan Cluster
oc apply -f infinispan-cluster.yaml

# 2. Aguardar cluster ficar pronto
oc wait --for=condition=Ready infinispan/apibolsa-cache -n apibolsa --timeout=300s

# 3. Criar configuração de Cache
oc apply -f cache-config.yaml

# 4. Atualizar Node.js
oc apply -f ../nodejs/nodejs-configmap.yaml
oc apply -f ../nodejs/nodejs-secret.yaml
oc rollout restart deployment/nodejs -n apibolsa
```

## 🔧 Configuração

### Variáveis de Ambiente (Node.js)

```yaml
DATAGRID_ENABLED: "true"
DATAGRID_URL: "http://apibolsa-cache:11222"
DATAGRID_USER: "developer"
DATAGRID_PASSWORD: "developer"
```

### Credenciais Padrão

- **Usuário**: `developer`
- **Senha**: `developer`

> **Nota**: As credenciais podem ser obtidas do Secret criado pelo Operator:
> ```bash
> oc get infinispan apibolsa-cache -n apibolsa -o jsonpath='{.status.security.endpointSecretName}'
> ```

## 📊 Funcionalidades de Cache

### 1. Cache de Teste de Conexão
- **Chave**: `db_connection_test`
- **TTL**: 5 minutos
- **Uso**: Armazena resultado do teste de conexão com MySQL

### 2. Cache de Usuários
- **Chave**: `user_{username}`
- **TTL**: 30 minutos
- **Uso**: Armazena dados de usuários para login mais rápido

### 3. Rate Limiting de Login
- **Chave**: `login_attempt_{username}`
- **TTL**: 5 minutos
- **Uso**: Limita tentativas de login (máximo 5)

## 🔍 APIs Disponíveis

### Status do Cache
```bash
GET /api/cache/status
```
Retorna informações sobre o cache (tipo, estatísticas, etc.)

### Limpar Cache
```bash
POST /api/cache/clear
```
Limpa todo o cache (requer autenticação)

## 🧪 Testar

### 1. Verificar Status do Cluster
```bash
oc get infinispan -n apibolsa
oc get pods -n apibolsa | grep apibolsa-cache
```

### 2. Verificar Cache
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i cache
```

### 3. Testar via API
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Fazer login (cria cache)
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Ver status do cache
curl http://$ROUTE/api/cache/status -b cookies.txt
```

### 4. Port Forward para Teste Direto
```bash
oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa
```

## 📁 Estrutura de Arquivos

```
datagrid/
├── infinispan-cluster.yaml    # Cluster Infinispan
├── cache-config.yaml          # Configuração de cache
├── deploy-datagrid.sh         # Script de deploy
└── README.md                  # Esta documentação
```

## 🐛 Troubleshooting

### Cluster não fica Ready

```bash
# Verificar eventos
oc get events -n apibolsa --sort-by='.lastTimestamp' | grep infinispan

# Ver logs do pod
oc logs -l app.kubernetes.io/name=infinispan -n apibolsa

# Verificar status
oc describe infinispan apibolsa-cache -n apibolsa
```

### Cache não funciona

```bash
# Verificar se Data Grid está acessível
oc exec deployment/nodejs -n apibolsa -- wget -qO- http://apibolsa-cache:11222/rest/v2/caches

# Verificar variáveis de ambiente
oc get deployment nodejs -n apibolsa -o jsonpath='{.spec.template.spec.containers[0].env}'

# Ver logs
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "Data Grid\|cache"
```

### Fallback para cache local

Se o Data Grid não estiver disponível, a aplicação automaticamente usa cache local (`node-cache`). Verifique os logs:

```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep "⚠️"
```

## 📝 Próximos Passos

- [ ] Configurar backup automático do cache
- [ ] Implementar cache distribuído com múltiplas réplicas
- [ ] Adicionar métricas de cache
- [ ] Configurar persistência do cache

## 🔗 Referências

- [Red Hat Data Grid Documentation](https://access.redhat.com/documentation/en-us/red_hat_data_grid/8.5)
- [Infinispan Operator](https://github.com/infinispan/infinispan-operator)
- [Data Grid REST API](https://infinispan.org/docs/stable/titles/rest/rest.html)



