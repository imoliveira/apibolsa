# 🔧 Correção - Kafka em Namespace Diferente

## ❌ Problema Identificado

O Node.js estava tentando conectar ao Kafka no namespace `apibolsa`, mas o Kafka está no namespace `kafka` com o nome `kafka-lab`.

**Erro**:
```
getaddrinfo ENOTFOUND apibolsa-kafka-kafka-bootstrap
```

## ✅ Correção Aplicada

### 1. Atualização do Bootstrap Server
- **Antes**: `apibolsa-kafka-kafka-bootstrap:9092`
- **Depois**: `kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092`

### 2. Arquivos Atualizados
- ✅ `nodejs-configmap.yaml` - Variável `KAFKA_BROKERS`
- ✅ `kafka-producer.js` - Default broker
- ✅ `kafka-consumer.js` - Default broker

### 3. Tópicos
- ✅ Verificando/criando tópicos no namespace `kafka`
- ✅ Cluster: `kafka-lab`

## 📊 Status do Kafka

### Namespace: `kafka`
- **Cluster**: `kafka-lab`
- **Bootstrap**: `kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092`
- **Status**: Running

### Tópicos Necessários
- `pedidos`
- `pagamentos`
- `notificacoes`
- `logs`

## 🧪 Verificar Conexão

### 1. Testar Conectividade
```bash
NODEJS_POD=$(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
oc exec $NODEJS_POD -n apibolsa -c nodejs -- nc -zv kafka-lab-kafka-bootstrap.kafka.svc.cluster.local 9092
```

### 2. Verificar Logs
```bash
oc logs -l app.kubernetes.io/name=nodejs -n apibolsa -c nodejs | grep -i "kafka\|consumer" | tail -10
```

**Esperado**: 
- ✅ "Kafka Producer inicializado"
- ✅ "Consumer iniciado para tópico: pedidos"
- Sem erros de "ENOTFOUND"

### 3. Verificar Tópicos
```bash
oc get kafkatopic -n kafka
```

## 📝 Configuração Final

### Variável de Ambiente
```yaml
KAFKA_BROKERS: "kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092"
```

### FQDN Completo
Usando FQDN completo (`namespace.svc.cluster.local`) para garantir resolução DNS entre namespaces.

## ✅ Próximos Passos

1. Aguardar Node.js reiniciar
2. Verificar logs - deve conectar ao Kafka
3. Testar via interface: `http://apibolsa.apps-crc.testing/kafka`

## 🔍 Troubleshooting

### Se ainda der erro de conexão:

1. **Verificar se Kafka está acessível**:
   ```bash
   oc get svc -n kafka | grep kafka-bootstrap
   ```

2. **Testar DNS**:
   ```bash
   oc run test-pod --image=busybox -it --rm --restart=Never -n apibolsa -- nslookup kafka-lab-kafka-bootstrap.kafka.svc.cluster.local
   ```

3. **Verificar NetworkPolicy** (se houver):
   ```bash
   oc get networkpolicy -n kafka
   oc get networkpolicy -n apibolsa
   ```



