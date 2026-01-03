# 🔧 Solução para Erro do Kafka: "The group coordinator is not available"

## 📋 Problema Identificado

O erro `The group coordinator is not available` ocorre porque:

1. **Kafka está tentando criar `__consumer_offsets` com replication factor 3**, mas só há **1 broker disponível**
2. O tópico `__consumer_offsets` é necessário para gerenciar consumer groups
3. Sem esse tópico, o coordenador do grupo não pode ser encontrado

## 🔍 Diagnóstico

Execute o script de diagnóstico:

```bash
cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa
./diagnosticar-kafka.sh
```

## ✅ Soluções Implementadas

### 1. Consumer Mais Resiliente

- ✅ Retry automático com backoff exponencial
- ✅ Timeout de conexão configurado
- ✅ Tratamento específico para erro de coordenador
- ✅ Aplicação não trava se Kafka não estiver disponível

### 2. Melhor Tratamento de Erros

- ✅ Erros de coordenador são tratados como não-críticos
- ✅ Aplicação continua funcionando mesmo sem consumers
- ✅ Logs mais informativos

### 3. Configurações Melhoradas

- ✅ Timeouts aumentados
- ✅ Retry com backoff exponencial
- ✅ Aguarda mais tempo antes de tentar conectar

## 🛠️ Soluções Adicionais (Opcional)

### Opção 1: Configurar Kafka para usar replication factor 1

Se você tiver acesso ao Kafka, configure para usar replication factor 1:

```bash
# Acessar o pod do Kafka
oc exec -it -n kafka kafka-lab-kafka-lab-pool-0 -- /bin/sh

# Criar tópico __consumer_offsets manualmente com replication factor 1
# (Isso geralmente é feito automaticamente, mas pode ser necessário ajustar)
```

### Opção 2: Adicionar mais brokers ao Kafka

Se possível, adicione mais brokers ao cluster Kafka para suportar replication factor 3.

### Opção 3: Desabilitar consumers temporariamente

Se o Kafka não for crítico para a aplicação, você pode desabilitar os consumers:

```bash
# Adicionar variável de ambiente no deployment
oc set env deployment/nodejs -n apibolsa KAFKA_ENABLED=false
```

## 📊 Status Atual

Após as correções:

- ✅ Aplicação não trava se Kafka não estiver disponível
- ✅ Consumers tentam reconectar automaticamente
- ✅ Logs mais claros sobre o status do Kafka
- ✅ Dashboard e outras funcionalidades continuam funcionando

## 🔍 Verificar Status

```bash
# Ver logs do Node.js
oc logs -n apibolsa -l app.kubernetes.io/name=nodejs --tail=50 | grep -i kafka

# Ver status dos pods
oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs

# Ver status do Kafka
oc get pods -n kafka -l app.kubernetes.io/name=kafka
```

## 💡 Nota Importante

O erro do Kafka **não impede** o funcionamento do dashboard financeiro. A aplicação continua funcionando normalmente, apenas os consumers do Kafka não estarão ativos até que o Kafka seja configurado corretamente.

## 🔧 Como Ajustar o Kafka

Para resolver o problema do replication factor, consulte o guia completo:

📄 **Ver:** [AJUSTAR-KAFKA-REPLICATION-FACTOR.md](./AJUSTAR-KAFKA-REPLICATION-FACTOR.md)

### Solução Rápida:

```bash
# 1. Editar Kafka CR para usar replication factor 1
oc edit kafka -n kafka

# 2. Adicionar no spec.kafka.config:
default.replication.factor: "1"
offsets.topic.replication.factor: "1"
transaction.state.log.replication.factor: "1"

# 3. Salvar e aguardar Kafka reiniciar
oc wait --for=condition=ready pod -n kafka -l strimzi.io/kind=Kafka --timeout=300s

# 4. Reiniciar Node.js para reconectar
oc rollout restart deployment/nodejs -n apibolsa
```

