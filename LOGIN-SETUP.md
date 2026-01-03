# 🔐 Sistema de Login - API Bolsa

## ✅ O que foi criado

### 1. Banco de Dados `loginapibolsaDB`
- **Database**: `loginapibolsaDB`
- **Usuário**: `teste`
- **Senha**: `teste`
- **Tabela**: `usuarios`

### 2. Tela de Login
- **URL**: `/login`
- **Interface**: Design moderno e responsivo
- **Funcionalidades**: 
  - Validação de usuário e senha
  - Mensagens de erro/sucesso
  - Redirecionamento automático

### 3. Sistema de Autenticação
- **Sessões**: Express-session
- **Hash de senhas**: bcrypt
- **Dashboard**: Área protegida após login

## 🔑 Credenciais

### Usuário de Teste
- **Usuário**: `teste`
- **Senha**: `teste`

## 🌐 Acessar

### URL Principal
```bash
# Obter URL
oc get route nginx -n apibolsa -o jsonpath='{.spec.host}'

# Acesse: http://apibolsa.apps-crc.testing/login
```

### Rotas Disponíveis

1. **Tela de Login**: `/login`
2. **Tela de Teste de Conexão**: `/`
3. **Dashboard** (após login): `/dashboard`

## 🧪 Testar Login

### 1. Acessar tela de login
```
http://apibolsa.apps-crc.testing/login
```

### 2. Fazer login
- Usuário: `teste`
- Senha: `teste`

### 3. Verificar dashboard
Após login, será redirecionado para `/dashboard`

## 📊 Estrutura do Banco

### Tabela `usuarios`
```sql
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    nome_completo VARCHAR(255),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP NULL
);
```

## 🔍 Verificar Banco de Dados

```bash
# Conectar ao banco
oc exec -it deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB

# Ver usuários
SELECT * FROM usuarios;

# Criar novo usuário (exemplo)
# O hash deve ser gerado com bcrypt no Node.js
```

## 🛠️ Adicionar Novos Usuários

### Via API (futuro)
```bash
curl -X POST http://apibolsa.apps-crc.testing/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "novo_usuario",
    "password": "senha123",
    "email": "usuario@example.com",
    "nome_completo": "Nome Completo"
  }'
```

### Via SQL (direto)
```bash
# Gerar hash da senha no Node.js primeiro
# Depois inserir no banco
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "
  INSERT INTO usuarios (username, password_hash, email, nome_completo, ativo) 
  VALUES ('novo_user', '\$2b\$10\$hash_aqui', 'email@example.com', 'Nome', TRUE);
"
```

## 🔄 Fluxo de Autenticação

1. Usuário acessa `/login`
2. Preenche usuário e senha
3. Node.js valida no banco `loginapibolsaDB`
4. Se válido, cria sessão
5. Redireciona para `/dashboard`
6. Dashboard verifica sessão antes de exibir

## 🐛 Troubleshooting

### Login não funciona

```bash
# Verificar se banco existe
oc exec deployment/mysql -n apibolsa -- mysql -uroot -proot123 -e "SHOW DATABASES LIKE 'loginapibolsaDB';"

# Verificar se usuário teste existe
oc exec deployment/mysql -n apibolsa -- mysql -uteste -pteste -D loginapibolsaDB -e "SELECT * FROM usuarios;"

# Ver logs do Node.js
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i login
```

### Sessão não persiste

```bash
# Verificar SESSION_SECRET no ConfigMap
oc get configmap nodejs-config -n apibolsa -o yaml | grep SESSION_SECRET

# Verificar cookies no navegador (F12 > Application > Cookies)
```

### Banco não inicializa

```bash
# Executar inicialização manual
oc exec deployment/mysql -n apibolsa -- mysql -uroot -proot123 < mysql-init-script.sql

# Ou conectar e executar manualmente
oc exec -it deployment/mysql -n apibolsa -- mysql -uroot -proot123
```

## 📝 Próximos Passos

- [ ] Adicionar funcionalidade de registro de usuários
- [ ] Adicionar recuperação de senha
- [ ] Adicionar roles/permissões
- [ ] Melhorar dashboard



