# API Bolsa - Fase 1

## 📋 Objetivo

Criar namespace `apibolsa` com:
- ✅ Nginx (proxy reverso)
- ✅ MySQL (banco de dados)
- ✅ Node.js (aplicação de teste de conexão)

## 🚀 Deploy

### Método Automatizado

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa
./deploy-all.sh
```

### Método Manual

```bash
# 1. Criar namespace
oc create namespace apibolsa

# 2. Deploy MySQL
oc apply -f mysql/

# 3. Aguardar MySQL
oc wait --for=condition=ready pod -l app.kubernetes.io/name=mysql -n apibolsa --timeout=120s

# 4. Criar ConfigMap com código Node.js
oc create configmap nodejs-app-code -n apibolsa \
  --from-file=server.js=nodejs/server.js \
  --from-file=package.json=nodejs/package.json \
  --from-file=index.html=nodejs/public/index.html

# 5. Deploy Node.js
oc apply -f nodejs/

# 6. Deploy Nginx
oc apply -f nginx/
```

## 🔍 Verificar Status

```bash
# Ver pods
oc get pods -n apibolsa

# Ver services
oc get svc -n apibolsa

# Ver routes
oc get route -n apibolsa

# Ver logs
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa
oc logs -l app.kubernetes.io/name=mysql -n apibolsa
oc logs -l app.kubernetes.io/name=nginx -n apibolsa
```

## 🌐 Acessar

```bash
# Obter URL
ROUTE=$(oc get route nginx -n apibolsa -o jsonpath='{.spec.host}')
echo "Acesse: http://$ROUTE"

# Ou usar port-forward
oc port-forward svc/nginx 8080:80 -n apibolsa
# Acesse: http://localhost:8080
```

## 🧪 Testar Conexão

1. Acesse a URL do nginx
2. Clique em "Testar Conexão"
3. Execute queries SQL de teste

## 📊 Credenciais MySQL

- **Host**: mysql
- **Port**: 3306
- **Database**: apibolsa
- **User**: apibolsa
- **Password**: apibolsa123
- **Root Password**: root123

## 🐛 Troubleshooting

### Pod Node.js não inicia

```bash
# Ver logs do initContainer
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c copy-files

# Ver logs do container principal
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa

# Verificar ConfigMap
oc get configmap nodejs-app-code -n apibolsa -o yaml
```

### MySQL não conecta

```bash
# Verificar se MySQL está rodando
oc get pods -l app.kubernetes.io/name=mysql -n apibolsa

# Testar conexão do Node.js para MySQL
oc exec -it deployment/nodejs -n apibolsa -- nc -zv mysql 3306
```

### Nginx não funciona

```bash
# Verificar logs
oc logs -l app.kubernetes.io/name=nginx -n apibolsa

# Testar nginx diretamente
oc exec -it deployment/nginx -n apibolsa -- curl http://nodejs:3000/health
```

## 📁 Estrutura

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
└── deploy-all.sh
```



