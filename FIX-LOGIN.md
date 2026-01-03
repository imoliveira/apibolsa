# 🔧 Correção do Login

## ✅ Problema Resolvido

O problema era que o hash da senha no banco de dados não correspondia à senha "teste".

## 🔄 O que foi feito

1. ✅ Hash atualizado no banco de dados
2. ✅ Código atualizado para sempre atualizar o hash na inicialização
3. ✅ Usuário `teste` validado

## 🔑 Credenciais

- **Usuário**: `teste`
- **Senha**: `teste`

## 🧪 Testar Agora

### Via Navegador
1. Acesse: `http://apibolsa.apps-crc.testing/login`
2. Digite:
   - Usuário: `teste`
   - Senha: `teste`
3. Clique em "Entrar"

### Via API
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Deve retornar: {"success":true,"user":{...}}
```

## 🔍 Verificar Hash

```bash
# Ver hash atual
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "SELECT username, LEFT(password_hash, 30) as hash FROM usuarios WHERE username='teste';"

# Testar validação
oc exec deployment/nodejs -n apibolsa -- node -e "
const bcrypt = require('bcrypt');
const hash = '$(oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -sN -e "SELECT password_hash FROM usuarios WHERE username='teste';" 2>&1 | tail -1)';
bcrypt.compare('teste', hash).then(match => console.log(match ? 'OK' : 'FALHOU'));
"
```

## 📝 Nota

O código agora atualiza automaticamente o hash do usuário `teste` toda vez que o Node.js inicia, garantindo que sempre esteja correto.



