# ✅ Status - API Bolsa

## 🎯 O que está funcionando

### ✅ Teste de Conexão MySQL
- **Status**: ✅ Funcionando
- **URL**: `http://apibolsa.apps-crc.testing`
- **Funcionalidades**:
  - Teste de conexão com banco `apibolsa`
  - Exibição de informações do MySQL
  - Execução de queries SQL

### ✅ Banco de Dados
- **MySQL**: ✅ Running
- **Banco `apibolsa`**: ✅ Criado
- **Banco `loginapibolsaDB`**: ✅ Criado
- **Usuário `teste`**: ✅ Criado

### ✅ Nginx
- **Status**: ✅ Running
- **Função**: Proxy reverso para Node.js

### ✅ Node.js
- **Status**: ✅ Running
- **Aplicação**: Rodando na porta 3000

## 🔐 Sistema de Login

### Acessar Login
```
http://apibolsa.apps-crc.testing/login
```

### Credenciais
- **Usuário**: `teste`
- **Senha**: `teste`

### Funcionalidades
- ✅ Tela de login criada
- ✅ Validação de usuário e senha
- ✅ Sessões com Express-session
- ✅ Hash de senhas com bcrypt
- ✅ Dashboard protegido

## 📊 Verificar Status Completo

```bash
# Ver pods
oc get pods -n apibolsa

# Ver services
oc get svc -n apibolsa

# Ver routes
oc get route -n apibolsa

# Testar login via API
ROUTE=$(oc get route nginx -n apibolsa -o jsonpath='{.spec.host}')
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt
```

## 🧪 Testar Agora

1. **Teste de Conexão**: http://apibolsa.apps-crc.testing ✅
2. **Login**: http://apibolsa.apps-crc.testing/login
3. **Dashboard**: http://apibolsa.apps-crc.testing/dashboard (após login)

## 🔍 Verificar Usuário no Banco

```bash
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "SELECT * FROM usuarios;"
```

## 📝 Próximos Passos

Se o login não estiver funcionando completamente:
1. Verificar se usuário `teste` existe no banco
2. Verificar logs do Node.js
3. Testar login via API



