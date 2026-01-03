# 🧪 Como Testar o Login

## ✅ Status Atual

- ✅ Banco `loginapibolsaDB` criado
- ✅ Usuário `teste` criado no banco
- ✅ Tela de login criada
- ✅ Sistema de autenticação configurado

## 🔑 Credenciais

- **Usuário**: `teste`
- **Senha**: `teste`

## 🌐 Acessar

### Obter URL
```bash
oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}'
```

### URLs Disponíveis

1. **Teste de Conexão**: `http://apibolsa.apps-crc.testing`
2. **Login**: `http://apibolsa.apps-crc.testing/login`
3. **Dashboard**: `http://apibolsa.apps-crc.testing/dashboard` (após login)

## 🧪 Testar Login

### Método 1: Via Navegador

1. Acesse: `http://apibolsa.apps-crc.testing/login`
2. Digite:
   - Usuário: `teste`
   - Senha: `teste`
3. Clique em "Entrar"
4. Deve redirecionar para `/dashboard`

### Método 2: Via API (curl)

```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Fazer login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt \
  -v

# Verificar sessão
curl http://$ROUTE/api/session \
  -b cookies.txt

# Acessar dashboard
curl http://$ROUTE/dashboard \
  -b cookies.txt
```

## 🔍 Verificar Banco

```bash
# Ver usuários
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "SELECT * FROM usuarios;"

# Ver estrutura da tabela
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "DESCRIBE usuarios;"
```

## 🐛 Troubleshooting

### Login não funciona

```bash
# Ver logs do Node.js
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i login

# Verificar se usuário existe
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "SELECT username FROM usuarios WHERE username='teste';"

# Testar conexão do Node.js para o banco de login
oc exec deployment/nodejs -n apibolsa -- wget -qO- http://localhost:3000/api/test-connection
```

### Erro de senha

O hash da senha "teste" deve ser gerado com bcrypt. Se não funcionar:

```bash
# Recriar usuário com hash correto
# O Node.js gera automaticamente na inicialização
oc rollout restart deployment/nodejs -n apibolsa
```

## ✅ Checklist

- [ ] Banco `loginapibolsaDB` existe
- [ ] Usuário `teste` existe na tabela `usuarios`
- [ ] Tela de login acessível em `/login`
- [ ] Login funciona com `teste`/`teste`
- [ ] Dashboard acessível após login
- [ ] Logout funciona



