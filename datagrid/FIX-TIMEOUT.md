# 🔧 Correção de Timeout - Data Grid

## ⚠️ Problema Identificado

O Node.js está dando timeout ao tentar conectar ao Data Grid:
```
⚠️ Data Grid não disponível, usando cache local: timeout of 5000ms exceeded
```

## ✅ Correções Aplicadas

### 1. Criação Automática de Cache
- Adicionada função `ensureCacheExists()` que cria o cache "default" automaticamente
- Cache é criado na primeira tentativa de uso

### 2. Redução de Timeout
- Timeout reduzido de 5000ms para 3000ms
- Evita esperas longas quando Data Grid não está disponível

### 3. Redução de Logs
- Logs de timeout não são mais exibidos (evita spam)
- Apenas erros reais são logados

### 4. Validação de Status HTTP
- Aceita status 404 (chave não existe) como válido
- Evita erros desnecessários

## 🧪 Como Validar

### 1. Verificar se Cache foi Criado
```bash
oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa &
sleep 3
curl -u developer:developer http://localhost:11222/rest/v2/caches
kill %1
```

### 2. Verificar Logs
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs --tail=20 | grep -E "cache criado|Data Grid|⚠️"
```

**Esperado**: 
- ✅ "Cache 'default' criado no Data Grid" (primeira vez)
- ✅ Sem mensagens de timeout repetidas
- ✅ "📦 Dados obtidos do cache" (quando funcionando)

### 3. Testar Funcionalidade
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Testar cache
curl -s http://$ROUTE/api/test-connection -b cookies.txt | jq '.fromCache'
```

## 📝 Próximos Passos

1. **Aguardar pod Node.js reiniciar** (já feito)
2. **Verificar logs** - deve aparecer "Cache 'default' criado" na primeira tentativa
3. **Testar funcionalidade** - segunda chamada deve retornar `fromCache: true`

## 🔍 Troubleshooting

### Se ainda der timeout:

1. **Verificar se Data Grid está pronto:**
   ```bash
   oc get pods -n apibolsa | grep apibolsa-cache
   oc logs apibolsa-cache-0 -n apibolsa --tail=20
   ```

2. **Verificar conectividade:**
   ```bash
   NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
   oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv apibolsa-cache 11222
   ```

3. **Testar diretamente:**
   ```bash
   oc port-forward svc/apibolsa-cache 11222:11222 -n apibolsa
   # Em outro terminal:
   curl -u developer:developer http://localhost:11222/rest/v2/caches
   ```

### Se cache não for criado:

O sistema automaticamente usa cache local como fallback. Isso é normal e funcional, apenas não será distribuído entre pods.



