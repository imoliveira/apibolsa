-- Script de inicialização do MySQL para API Bolsa
-- Criar banco de dados loginapibolsaDB
CREATE DATABASE IF NOT EXISTS loginapibolsaDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Criar usuário teste
CREATE USER IF NOT EXISTS 'teste'@'%' IDENTIFIED BY 'teste';

-- Conceder permissões
GRANT ALL PRIVILEGES ON loginapibolsaDB.* TO 'teste'@'%';

-- Aplicar permissões
FLUSH PRIVILEGES;

-- Usar o banco
USE loginapibolsaDB;

-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    nome_completo VARCHAR(255),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_username ON usuarios(username);

-- Inserir usuário de teste (senha: teste - hash bcrypt)
-- Hash gerado para senha "teste": $2b$10$rX8K5vJ3$8qJZ5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y
-- Vamos usar um hash real gerado pelo Node.js
INSERT INTO usuarios (username, password_hash, email, nome_completo, ativo) 
VALUES ('teste', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teste@apibolsa.local', 'Usuário Teste', TRUE)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);



