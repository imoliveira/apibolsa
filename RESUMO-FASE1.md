# 📋 Resumo Fase 1 - API Bolsa

## ✅ O que foi criado

### 1. Namespace
- **Nome**: `apibolsa`
- **Status**: ✅ Criado

### 2. MySQL
- **Deployment**: `mysql`
- **Service**: `mysql:3306`
- **Status**: ✅ Running
- **Database**: `apibolsa`
- **Usuário**: `apibolsa` / `apibolsa123`
- **Root**: `root` / `root123`

### 3. Node.js
- **Deployment**: `nodejs`
- **Service**: `nodejs:3000`
- **Status**: ✅ Running
- **Aplicação**: Teste de conexão com MySQL
- **Tela**: Interface web para testar conexão

### 4. Nginx
- **Deployment**: `nginx`
- **Service**: `nginx:80` (proxy para 8080)
- **Route**: `apibolsa.apps-crc.testing`
- **Status**: ✅ Running
- **Função**: Load balancer / Proxy reverso

## 🌐 Acesso

### URL Principal
```bash
# Obter URL
oc get route nginx -n apibolsa -o jsonpath='{.spec.host}'

# Acesse: http://apibolsa.apps-crc.testing
```

### Port Forward (Alternativa)
```bash
oc port-forward svc/nginx 8080:80 -n apibolsa
# Acesse: http://localhost:8080
```

## 🧪 Testar Conexão

1. Acesse a URL do nginx
2. Clique em **"Testar Conexão"**
3. Deve mostrar:
   - ✅ Status: Conectado
   - Versão MySQL
   - Database atual
   - Usuário conectado

## 📊 Status Atual

```bash
# Ver pods
oc get pods -n apibolsa

# Ver services
oc get svc -n apibolsa

# Ver routes
oc get route -n apibolsa
```

## 🔧 Credenciais

### MySQL
- **Host**: mysql
- **Port**: 3306
- **Database**: apibolsa
- **User**: apibolsa
- **Password**: apibolsa123

### Node.js
- **Port**: 3000
- **Health**: http://nodejs:3000/health

## 📁 Arquivos Criados

```
apibolsa/
├── mysql/
│   ├── mysql-secret.yaml
│   ├── mysql-configmap.yaml
│   ├── mysql-deployment.yaml
│   └── mysql-service.yaml
├── nodejs/
│   ├── server.js
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   ├── nodejs-configmap.yaml
│   ├── nodejs-secret.yaml
│   ├── nodejs-deployment.yaml
│   └── nodejs-service.yaml
├── nginx/
│   ├── nginx-configmap.yaml
│   ├── nginx-deployment.yaml
│   ├── nginx-service.yaml
│   └── nginx-route.yaml
├── deploy-all.sh
└── README.md
```

## 🎯 Próximos Passos

1. ✅ Namespace criado
2. ✅ MySQL instalado
3. ✅ Node.js instalado
4. ✅ Nginx instalado
5. ✅ Tela de teste criada
6. ⏳ Testar conexão via interface web

## 🐛 Troubleshooting

### Verificar Logs
```bash
# MySQL
oc logs -l app.kubernetes.io/name=mysql -n apibolsa

# Node.js
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa

# Nginx
oc logs -l app.kubernetes.io/name=nginx -n apibolsa
```

### Testar Conectividade
```bash
# Do Node.js para MySQL
oc exec deployment/nodejs -n apibolsa -- nc -zv mysql 3306

# Do Nginx para Node.js
oc exec deployment/nginx -n apibolsa -- wget -qO- http://nodejs:3000/health
```



