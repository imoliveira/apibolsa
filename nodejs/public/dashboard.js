// Dashboard Financeiro - API Bolsa
let refreshInterval = null;

// Função para formatar número
function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || value === '' || value === '0.00') return '0.00';
    // Se já é uma string formatada, retornar como está
    if (typeof value === 'string' && value.includes(',')) {
        return value;
    }
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(decimals);
}

// Função para formatar porcentagem
function formatPercent(value) {
    if (value === null || value === undefined || value === '' || value === '0.00%') return '0.00%';
    // Se já é uma string formatada com %, retornar como está
    if (typeof value === 'string' && value.includes('%')) {
        return value;
    }
    const val = parseFloat(value);
    if (isNaN(val)) return '0.00%';
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

// Função para obter classe de variação
function getVariationClass(value) {
    if (!value || value === 0 || value === '0.00' || value === '0.00%') return 'neutral';
    // Extrair número da string se necessário
    const num = typeof value === 'string' ? parseFloat(value.replace(/[+\-%]/g, '')) : parseFloat(value);
    if (isNaN(num) || num === 0) return 'neutral';
    // Verificar se tem sinal negativo na string original
    if (typeof value === 'string' && value.startsWith('-')) return 'negative';
    return num >= 0 ? 'positive' : 'negative';
}

// Função para criar barra de tendência
function createTrendBar(value) {
    const isPositive = parseFloat(value) >= 0;
    const width = Math.min(Math.abs(parseFloat(value)) * 10, 100);
    
    return `
        <div class="trend-bar">
            <div class="trend-bar-fill ${isPositive ? 'positive' : 'negative'}" 
                 style="width: ${width}%"></div>
        </div>
    `;
}

// Função para formatar valor (extraída para reutilização)
function formatValue(val, isCurrency = false) {
    if (!val || val === '0.00' || val === '0') return isCurrency ? '0.0000' : '0.00';
    
    // Se já é string formatada, tentar preservar casas decimais
    const valStr = String(val);
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    
    // Se for moeda/futuro (valor pequeno < 1), usar 4-5 casas decimais
    if (isCurrency && num < 1) {
        // Determinar número de casas decimais baseado no valor original
        let decimalPlaces = 0;
        if (valStr.includes('.')) {
            const parts = valStr.split('.');
            decimalPlaces = parts[1] ? parts[1].length : 0;
        }
        // Usar pelo menos 4 casas, mas manter as originais se tiver mais (até 5)
        const decimals = decimalPlaces > 0 ? Math.max(4, Math.min(decimalPlaces, 5)) : 4;
        return num.toFixed(decimals);
    }
    
    // Se o número for muito grande, usar separador de milhar
    if (num >= 1000) {
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toFixed(2);
}

// Função auxiliar para calcular e formatar valor inverso
function formatInverseValue(val) {
    const num = parseFloat(val) || 0;
    if (num <= 0) return '0.000000';
    const inverse = 1 / num;
    return inverse.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

// Função para criar célula com valor e inverso
function createValueWithInverseCell(val) {
    const valStr = formatValue(val, true);
    const inverseStr = formatInverseValue(val);
    return `
        <div class="table-cell cell-value cell-value-with-inverse">
            <div class="value-main">${valStr}</div>
            <div class="value-inverse">${inverseStr}</div>
        </div>
    `;
}

// Função para criar linha da tabela do Brazilian Real (estilo CME Group)
function createBrazilianRealRow(data, index) {
    const variationClass = getVariationClass(data.variation);
    
    // Formatar valores com 4 casas decimais
    const value = data.value || '0.0000';
    const max = data.max || value;
    const min = data.min || value;
    const open = data.open || value;
    
    // Extrair código GLOBEX e mês do nome
    let globexCode = '';
    let monthDisplay = data.mes || '';
    
    // Se o nome é um código GLOBEX (ex: "6LG6"), usar diretamente
    if (data.name && data.name.match(/^\d{1}[A-Z]{2}\d{1}$/)) {
        globexCode = data.name;
    } else if (data.name) {
        // Tentar extrair código GLOBEX do nome (ex: "6LG6" de "FEB 2026 6LG6")
        const globexMatch = data.name.match(/(\d{1}[A-Z]{2}\d{1})/);
        if (globexMatch) {
            globexCode = globexMatch[1];
        }
        // Se não tem mês mas tem no nome, extrair
        if (!monthDisplay && data.name.match(/[A-Z]{3}\s+\d{4}/)) {
            monthDisplay = data.name.match(/([A-Z]{3}\s+\d{4})/)[1];
        }
    }
    
    // Se ainda não tem mês, usar padrão baseado no código GLOBEX
    if (!monthDisplay && globexCode) {
        // Mapear código GLOBEX para mês (aproximação)
        const monthMap = {
            '6LG': 'FEB', '6LH': 'MAR', '6LJ': 'JUN', '6LK': 'SEP', '6LN': 'DEC'
        };
        const prefix = globexCode.substring(0, 3);
        const year = globexCode.substring(3) === '6' ? '2026' : '2025';
        monthDisplay = (monthMap[prefix] || 'FEB') + ' ' + year;
    }
    
    // CHANGE pode vir como "-0.00035 (-0.19%)" ou separado
    let changeDisplay = data.variation || '0.0000';
    // Se não contém parênteses, adicionar o percentual
    if (changeDisplay && !changeDisplay.includes('(') && data.percent) {
      changeDisplay = `${changeDisplay} (${data.percent})`;
    }
    
    // Função auxiliar para calcular valor em reais (1/valor)
    const calculateRealValue = (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) return null;
        return (1 / num).toFixed(5);
    };
    
    // Calcular valores em reais para cada campo
    const realValue = calculateRealValue(value);
    const realOpen = calculateRealValue(open);
    const realHigh = calculateRealValue(max);
    const realLow = calculateRealValue(min);
    
    // Função auxiliar para criar célula com valor e conversão em reais
    const createValueCell = (val, realVal) => {
        if (realVal) {
            return `<div class="table-cell cell-value cell-value-with-real">
                <div class="value-main">${val}</div>
                <div class="value-real">R$ ${realVal}</div>
            </div>`;
        }
        return `<div class="table-cell cell-value">${val}</div>`;
    };
    
    return `
        <div class="table-row brazilian-real-row ${index % 2 === 0 ? 'row-even' : 'row-odd'}">
            <div class="table-cell cell-month">
                <span class="month-icon">💼</span>
                <div class="month-info">
                    <div class="month-text">${monthDisplay}</div>
                    <div class="globex-code">${globexCode || data.name || ''}</div>
                </div>
            </div>
            <div class="table-cell cell-options">
                <button class="opt-button">OPT</button>
            </div>
            <div class="table-cell cell-chart">
                <span class="chart-icon">📊</span>
            </div>
            ${createValueCell(value, realValue)}
            <div class="table-cell cell-variation ${variationClass}">${changeDisplay}</div>
            <div class="table-cell cell-value">${data.priorSettle || '-'}</div>
            ${createValueCell(open, realOpen)}
            ${createValueCell(min, realLow)}
            ${createValueCell(max, realHigh)}
        </div>
    `;
}

// Função para criar linha da tabela
function createTableRow(data, isCurrency = false, isTreasuries = false) {
    const variationClass = getVariationClass(data.variation);
    const percentClass = getVariationClass(data.percent);
    const timeClass = variationClass; // Usar mesma classe para cor do ícone
    
    // Formatar variação com sinal
    const variation = data.variation || '0.00';
    // Para Treasuries usar 3 casas decimais, para moedas/futuros usar 4, senão 2
    let variationDecimals = 2;
    if (isTreasuries) {
        variationDecimals = 3;
    } else if (isCurrency) {
        variationDecimals = 4;
    }
    
    const variationFormatted = parseFloat(variation) >= 0 ? 
        `+${formatNumber(variation, variationDecimals)}` : formatNumber(variation, variationDecimals);
    
    // Para Treasuries, usar 3 casas decimais nos valores
    const valueDecimals = isTreasuries ? 3 : (isCurrency ? 4 : 2);
    const formatTreasuryValue = (val) => {
        if (isTreasuries) {
            const num = parseFloat(val) || 0;
            return num.toFixed(3);
        }
        return formatValue(val, isCurrency);
    };
    
    // Para Treasuries, usar ordem específica: Name, Yield, Prev., High, Low, Chg., Chg.%, Time
    if (isTreasuries) {
        return `
            <div class="table-row">
                <div class="table-cell cell-name">${data.name}</div>
                <div class="table-cell cell-value">${formatTreasuryValue(data.value)}</div>
                <div class="table-cell cell-value">${formatTreasuryValue(data.previous || data.value)}</div>
                <div class="table-cell cell-value">${formatTreasuryValue(data.max || data.value)}</div>
                <div class="table-cell cell-value">${formatTreasuryValue(data.min || data.value)}</div>
                <div class="table-cell cell-variation ${variationClass}">${variationFormatted}</div>
                <div class="table-cell cell-percent ${percentClass}">${formatPercent(data.percent)}</div>
                <div class="table-cell cell-time ${timeClass}">${data.time || ''}</div>
            </div>
        `;
    }
    
    // Para outras tabelas, usar ordem padrão
    return `
        <div class="table-row">
            <div class="table-cell cell-name">${data.name}</div>
            <div class="table-cell cell-mes">${data.mes || ''}</div>
            <div class="table-cell cell-value">${formatTreasuryValue(data.value)}</div>
            <div class="table-cell cell-value">${formatTreasuryValue(data.max || data.value)}</div>
            <div class="table-cell cell-value">${formatTreasuryValue(data.min || data.value)}</div>
            <div class="table-cell cell-variation ${variationClass}">${variationFormatted}</div>
            <div class="table-cell cell-percent ${percentClass}">${formatPercent(data.percent)}</div>
            <div class="table-cell cell-time ${timeClass}">${data.time || ''}</div>
        </div>
    `;
}

// Função para renderizar tabela
function renderTable(containerId, data, isCurrency = false) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`❌ Container não encontrado: ${containerId}`);
        return;
    }
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="table-loading">Sem dados disponíveis</div>';
        return;
    }
    
    // Detectar se é Brazilian Real ou outras moedas baseado no containerId
    const isBrazilianReal = containerId === 'dolar-americas-table';
    const isTreasuries = containerId === 'treasuries-table';
    
    // Log para debug do Treasuries
    if (isTreasuries) {
        console.log(`📊 Renderizando tabela Treasuries com ${data.length} itens`);
        if (data[0]) {
            console.log(`📊 Primeiro item:`, JSON.stringify(data[0], null, 2));
        }
    }
    
    if (containerId === 'dolar-americas-table' || containerId.includes('real') || containerId.includes('moedas')) {
        isCurrency = true;
    }
    
    // Criar header da tabela - estrutura diferente para Brazilian Real
    let header = '';
    let rows = '';
    
    if (isBrazilianReal) {
        // Header compacto estilo CME Group para Brazilian Real
        const firstContract = data[0] || {};
        // Extrair código GLOBEX do nome (pode ser "6LG6" ou "BRL/USD")
        let globexCode = '6LG6';
        if (firstContract.name) {
            const globexMatch = firstContract.name.match(/(\d{1}[A-Z]{2}\d{1})/);
            if (globexMatch) {
                globexCode = globexMatch[1];
            } else if (firstContract.name.length <= 6) {
                globexCode = firstContract.name;
            }
        }
        
        const lastValue = firstContract.value || '0.0000';
        const changeValue = firstContract.variation || '0.0000';
        const changePercent = firstContract.percent || '0.00%';
        const volume = firstContract.volume || '0';
        const lastUpdate = firstContract.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Para Brazilian Real, usar o valor exatamente como está (sem formatação adicional)
        // Garantir que tenha 4 casas decimais se for número
        let lastDisplay = lastValue;
        let realValue = null; // Valor convertido em reais (1/valor)
        if (lastDisplay && !isNaN(parseFloat(lastDisplay))) {
            const num = parseFloat(lastDisplay);
            lastDisplay = num.toFixed(4);
            // Calcular valor em reais: 1/valor
            if (num > 0) {
                realValue = (1 / num).toFixed(5);
                console.log(`💰 Brazilian Real: LAST=${lastDisplay}, Valor em R$=${realValue}`);
            }
        }
        
        // Formatar CHANGE com percentual - garantir formato "-0.00035 (-0.19%)"
        let changeDisplay = changeValue;
        if (changeDisplay && !changeDisplay.includes('(') && changePercent) {
            changeDisplay = `${changeDisplay} (${changePercent})`;
        }
        const changeClass = getVariationClass(changeValue);
        
        header = `
            <div class="brazilian-real-summary">
                <div class="br-summary-title">
                    <h3>Brazilian Real</h3>
                    <span class="br-subtitle">Futures and Options</span>
                </div>
                <div class="br-summary-metrics">
                    <div class="br-metric">
                        <span class="br-metric-label">GLOBEX CODE</span>
                        <span class="br-metric-value globex-box">${globexCode}</span>
                        <span class="br-info-icon">ℹ️</span>
                    </div>
                    <div class="br-metric">
                        <span class="br-metric-label">LAST</span>
                        <span class="br-metric-value">${lastDisplay}</span>
                        ${realValue ? `<div class="br-real-value">R$ ${realValue}</div>` : ''}
                    </div>
                    <div class="br-metric">
                        <span class="br-metric-label">CHANGE</span>
                        <span class="br-metric-value ${changeClass}">${changeDisplay}</span>
                    </div>
                    <div class="br-metric">
                        <span class="br-metric-label">VOLUME</span>
                        <span class="br-metric-value">${volume}</span>
                    </div>
                </div>
                <div class="br-summary-footer">
                    <span>Last Updated ${lastUpdate}. Market data is delayed by at least 10 minutes.</span>
                </div>
            </div>
            <div class="table-header-row brazilian-real-header">
                <div>MONTH</div>
                <div>OPTIONS</div>
                <div>CHART</div>
                <div>LAST</div>
                <div>CHANGE</div>
                <div>PRIOR SETTLE</div>
                <div>OPEN</div>
                <div>HIGH</div>
                <div>LOW</div>
            </div>
        `;
        rows = data.map((item, index) => createBrazilianRealRow(item, index)).join('');
    } else if (isTreasuries) {
        // Header específico para Treasuries - ordem igual ao Investing.com
        header = `
            <div class="table-header-row">
                <div>Name</div>
                <div>Yield</div>
                <div>Prev.</div>
                <div>High</div>
                <div>Low</div>
                <div>Chg.</div>
                <div>Chg. %</div>
                <div>Time</div>
            </div>
        `;
        rows = data.map(item => createTableRow(item, isCurrency, isTreasuries)).join('');
    } else {
        // Header padrão para outras tabelas
        header = `
            <div class="table-header-row">
                <div>Nome</div>
                <div>Mês</div>
                <div>Último</div>
                <div>Máxima</div>
                <div>Mínima</div>
                <div>Variação</div>
                <div>Var. %</div>
                <div>Hora</div>
            </div>
        `;
        rows = data.map(item => createTableRow(item, isCurrency, isTreasuries)).join('');
    }
    
    container.innerHTML = header + rows;
}

// Função para renderizar resumo
function renderResumo(data) {
    const resumoTable = document.getElementById('resumo-table');
    if (!resumoTable || !data) return;
    
    // Atualizar barras primeiro
    if (data.tendencia) {
        const negative = data.tendencia.negative || 17;
        const positive = data.tendencia.positive || 75;
        const barNegative = document.getElementById('bar-negative');
        const barPositive = document.getElementById('bar-positive');
        if (barNegative) barNegative.style.width = negative + '%';
        if (barPositive) barPositive.style.width = positive + '%';
        
        // Atualizar labels
        const labels = document.querySelectorAll('.chart-labels span');
        if (labels.length >= 2) {
            labels[0].textContent = negative + '%';
            labels[1].textContent = positive + '%';
        }
    }
    
    // Renderizar items do resumo
    if (data.items && Array.isArray(data.items)) {
        const html = data.items.map(item => `
            <div class="table-row">
                <div class="table-cell cell-name">${item.nome || ''}</div>
                <div class="table-cell cell-percent ${getVariationClass(item.variacao)}">
                    ${item.variacao || '0.00%'}
                </div>
            </div>
        `).join('');
        resumoTable.innerHTML = html;
    } else {
        resumoTable.innerHTML = '<div class="table-loading">Sem dados disponíveis</div>';
    }
}

// Função para renderizar calendário econômico
function renderEconomicCalendar(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="table-loading">Nenhum evento disponível</div>';
        return;
    }
    
    // Criar header da tabela
    const header = `
        <div class="calendar-header-row">
            <div>Hora</div>
            <div>País</div>
            <div>Evento</div>
            <div>Real</div>
            <div>Previsão</div>
            <div>Anterior</div>
            <div>Impacto</div>
        </div>
    `;
    
    const rows = data.map(item => {
        // Determinar classe de impacto
        let impactClass = 'impact-medium';
        if (item.impact) {
            const impactLower = item.impact.toLowerCase();
            if (impactLower.includes('alta') || impactLower.includes('high')) {
                impactClass = 'impact-high';
            } else if (impactLower.includes('baixa') || impactLower.includes('low')) {
                impactClass = 'impact-low';
            }
        }
        
        return `
            <div class="calendar-row">
                <div class="calendar-cell calendar-time">${item.time || 'N/A'}</div>
                <div class="calendar-cell calendar-country">${item.country || 'N/A'}</div>
                <div class="calendar-cell calendar-event">${item.event || 'N/A'}</div>
                <div class="calendar-cell calendar-value">${item.actual || '-'}</div>
                <div class="calendar-cell calendar-value">${item.forecast || '-'}</div>
                <div class="calendar-cell calendar-value">${item.previous || '-'}</div>
                <div class="calendar-cell calendar-impact ${impactClass}">${item.impact || 'Média'}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = header + rows;
}

// Função para renderizar notícias
function renderNoticias(data) {
    const container = document.getElementById('noticias-content');
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="table-loading">Nenhuma notícia disponível</div>';
        return;
    }
    
    const html = data.map(item => `
        <div class="news-item">
            <div class="news-title">${item.title}</div>
            <div class="news-time">${item.time || ''}</div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Função para buscar dados
async function fetchData() {
    try {
        console.log('🔄 Buscando dados do dashboard...');
        // Adicionar timestamp único para evitar cache
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/finance/dashboard?_t=${timestamp}`, {
            credentials: 'include', // Incluir cookies para autenticação
            cache: 'no-cache', // Evitar cache do navegador
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        console.log('📡 Resposta recebida:', response.status, response.statusText);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('⚠️ Não autenticado, redirecionando para login');
                window.location.href = '/login';
                return;
            }
            const errorText = await response.text();
            console.error('❌ Erro na resposta:', errorText);
            throw new Error(`Erro ao buscar dados: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log('✅ Dados recebidos:', Object.keys(data));
        console.log('📊 Treasuries recebidos:', data.treasuries ? data.treasuries.length : 0, 'itens');
        if (data.treasuries && data.treasuries.length > 0) {
            console.log('📊 Primeiro Treasury recebido no fetchData:', JSON.stringify(data.treasuries[0], null, 2));
        }
        
        // Armazenar dados para pesquisa
        allAssetsData = {
            moedas: data.moedas || [],
            dolarAmericas: data.dolarAmericas || [],
            dolarMundo: data.dolarMundo || [],
            dolarEmergentes: data.dolarEmergentes || [],
            americas: data.americas || [],
            futuros: data.futuros || [],
            europa: data.europa || [],
            treasuries: data.treasuries || [],
            asiaOceania: data.asiaOceania || [],
            criptomoedas: data.criptomoedas || []
        };
        
        // Renderizar cada seção
        if (data.americas) {
            console.log('📊 Renderizando Américas:', data.americas.length, 'itens');
            renderTable('americas-table', data.americas);
        }
        if (data.futuros) renderTable('futuros-table', data.futuros);
        if (data.economicCalendar) renderEconomicCalendar('economic-calendar', data.economicCalendar);
        if (data.dolarEmergentes) renderTable('dolar-emergentes-table', data.dolarEmergentes);
        if (data.dolarMundo) renderTable('dolar-mundo-table', data.dolarMundo);
        if (data.europa) renderTable('europa-table', data.europa);
        if (data.treasuries) {
            console.log('📊 Renderizando Treasuries:', data.treasuries.length, 'itens');
            console.log('📊 Primeiro Treasury recebido:', JSON.stringify(data.treasuries[0], null, 2));
            renderTable('treasuries-table', data.treasuries);
        }
        if (data.asiaOceania) renderTable('asia-oceania-table', data.asiaOceania);
        if (data.moedas) renderTable('moedas-table', data.moedas);
        if (data.dolarAmericas) renderTable('dolar-americas-table', data.dolarAmericas);
        if (data.criptomoedas) renderTable('criptomoedas-table', data.criptomoedas);
        
        // Atualizar Dólar Cupom
        if (data.dolarCupom) {
            const valores = data.dolarCupom.valores || {};
            
            // DIF OPER CASADA
            const difElement = document.getElementById('dolar-cupom-dif');
            if (difElement && valores.difOperCasada) {
                difElement.textContent = `R$ ${parseFloat(valores.difOperCasada).toFixed(2)}`;
            }
            
            // CUPOM LIMPO
            const limpoElement = document.getElementById('dolar-cupom-limpo');
            if (limpoElement && valores.cupomLimpo) {
                limpoElement.textContent = `R$ ${parseFloat(valores.cupomLimpo).toFixed(4)}`;
            }
            
            // SPOT 2 DIAS
            const spot2Element = document.getElementById('dolar-cupom-spot2');
            if (spot2Element && valores.spot2Dias) {
                spot2Element.textContent = `R$ ${parseFloat(valores.spot2Dias).toFixed(4)}`;
            }
            
            // SPOT 1 DIA
            const spot1Element = document.getElementById('dolar-cupom-spot1');
            if (spot1Element && valores.spot1Dia) {
                spot1Element.textContent = `R$ ${parseFloat(valores.spot1Dia).toFixed(4)}`;
            }
        }
        
        // Atualizar timestamp
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            // Usar timestamp do servidor se disponível, senão usar timestamp local
            const updateTime = data.lastUpdate ? 
                new Date(data.lastUpdate).toLocaleTimeString('pt-BR') : 
                new Date().toLocaleTimeString('pt-BR');
            lastUpdate.textContent = `Atualizado: ${updateTime}`;
            lastUpdate.style.color = '#ffffff';
        }
        
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Mostrar erro em todas as seções
        document.querySelectorAll('.data-table').forEach(el => {
            if (el.innerHTML.includes('Carregando') || el.innerHTML.trim() === '') {
                el.innerHTML = `<div class="table-loading" style="color: #f44336;">Erro: ${error.message}</div>`;
            }
        });
        
        // Mostrar erro no header
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = `Erro: ${error.message}`;
            lastUpdate.style.color = '#ffcccc';
        }
    }
}

// Função para atualizar dados
function refreshData() {
    const btn = document.getElementById('refreshBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Atualizando...';
    }
    
    fetchData().finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Atualizar';
        }
    });
}

// Função para carregar mais notícias
function loadMoreNews() {
    // Implementar lógica para carregar mais notícias
    console.log('Carregar mais notícias...');
}

// Função para gerenciar abas
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remover active de todos
            tabButtons.forEach(b => b.classList.remove('active'));
            // Adicionar active ao clicado
            btn.classList.add('active');
            // Aqui você pode adicionar lógica para mudar o conteúdo da tabela
            console.log('Aba selecionada:', btn.dataset.tab);
        });
    });
}

// Função para atualizar relógio
function updateClock() {
    const clockElement = document.getElementById('clock');
    if (clockElement) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

// Função para mostrar seção específica
function showSection(sectionName) {
    const mainContent = document.querySelector('.main-content');
    
    // Se for dashboard, mostrar múltiplas seções em grid
    if (sectionName === 'dashboard') {
        mainContent.classList.add('dashboard-mode');
        
        // Mostrar 6 seções principais (3 na primeira linha, 3 na segunda)
        const dashboardSections = [
            'section-moedas',
            'section-dolar-mundo',
            'section-dolar-emergentes',
            'section-americas',
            'section-futuros',
            'section-treasuries'
        ];
        
        // Calendário abaixo ocupando toda largura
        const calendarSection = 'section-calendar';
        
        // Esconder todas as seções primeiro
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active', 'dashboard-box', 'dashboard-box-full');
        });
        
        // Mostrar seções do dashboard
        dashboardSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active', 'dashboard-box');
            }
        });
        
        // Mostrar calendário abaixo ocupando toda largura
        const calendar = document.getElementById(calendarSection);
        if (calendar) {
            calendar.classList.add('active', 'dashboard-box', 'dashboard-box-full');
        }
        
        return false;
    }
    
    // Para outras seções, modo normal (uma por vez)
    mainContent.classList.remove('dashboard-mode');
    
    // Esconder todas as seções
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active', 'dashboard-box');
    });
    
    // Mapear nomes de seção para IDs
    const sectionMap = {
        'moedas': 'section-moedas',
        'brazilian-real': 'section-brazilian-real',
        'dolar-mundo': 'section-dolar-mundo',
        'dolar-emergentes': 'section-dolar-emergentes',
        'americas': 'section-americas',
        'futuros': 'section-futuros',
        'europa': 'section-europa',
        'treasuries': 'section-treasuries',
        'asia-oceania': 'section-asia-oceania',
        'criptomoedas': 'section-criptomoedas',
        'calendar': 'section-calendar'
    };
    
    // Mostrar seção selecionada
    const sectionId = sectionMap[sectionName] || 'section-moedas';
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        // Scroll suave para a seção
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    return false; // Prevenir comportamento padrão do link
}

// Função para pesquisar ativos
let allAssetsData = {}; // Armazenar todos os dados para pesquisa

function searchAssets(query) {
    if (!query || query.trim() === '') {
        return [];
    }
    
    const searchTerm = query.toLowerCase().trim();
    const results = [];
    
    // Pesquisar em todos os dados disponíveis
    Object.keys(allAssetsData).forEach(category => {
        const items = allAssetsData[category];
        if (Array.isArray(items)) {
            items.forEach(item => {
                const name = (item.name || '').toLowerCase();
                if (name.includes(searchTerm)) {
                    results.push({
                        category: category,
                        name: item.name,
                        value: item.value,
                        variation: item.variation,
                        percent: item.percent
                    });
                }
            });
        }
    });
    
    return results;
}

// Função para exibir resultados da pesquisa
function displaySearchResults(results) {
    // Criar ou atualizar dropdown de resultados
    let resultsDropdown = document.getElementById('search-results');
    if (!resultsDropdown) {
        resultsDropdown = document.createElement('div');
        resultsDropdown.id = 'search-results';
        resultsDropdown.className = 'search-results-dropdown';
        document.querySelector('.search-container').appendChild(resultsDropdown);
    }
    
    if (results.length === 0) {
        resultsDropdown.innerHTML = '<div class="search-result-item">Nenhum resultado encontrado</div>';
        resultsDropdown.style.display = 'block';
        return;
    }
    
    // Limitar a 10 resultados
    const limitedResults = results.slice(0, 10);
    
    resultsDropdown.innerHTML = limitedResults.map(result => {
        const variationClass = getVariationClass(result.variation);
        return `
            <div class="search-result-item" onclick="selectSearchResult('${result.category}', '${result.name}')">
                <div class="search-result-name">${result.name}</div>
                <div class="search-result-category">${result.category}</div>
                <div class="search-result-value ${variationClass}">${result.value || 'N/A'}</div>
            </div>
        `;
    }).join('');
    
    resultsDropdown.style.display = 'block';
}

// Função para selecionar resultado da pesquisa
function selectSearchResult(category, name) {
    // Mapear categoria para seção
    const categoryMap = {
        'moedas': 'moedas',
        'dolarAmericas': 'brazilian-real',
        'dolarMundo': 'dolar-mundo',
        'dolarEmergentes': 'dolar-emergentes',
        'americas': 'americas',
        'futuros': 'futuros',
        'europa': 'europa',
        'treasuries': 'treasuries',
        'asiaOceania': 'asia-oceania',
        'criptomoedas': 'criptomoedas'
    };
    
    const section = categoryMap[category] || 'moedas';
    showSection(section);
    
    // Esconder dropdown
    const resultsDropdown = document.getElementById('search-results');
    if (resultsDropdown) {
        resultsDropdown.style.display = 'none';
    }
    
    // Limpar campo de pesquisa
    const searchInput = document.getElementById('assetSearch');
    if (searchInput) {
        searchInput.value = '';
    }
}

// Inicializar dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 Dashboard inicializado');
    
    // Inicializar relógio
    updateClock();
    setInterval(updateClock, 1000); // Atualizar a cada segundo
    
    // Inicializar abas
    initTabs();
    
    // Mostrar modo dashboard por padrão (3-4 boxes pequenos)
    showSection('dashboard');
    
    // Inicializar pesquisa de ativos
    const searchInput = document.getElementById('assetSearch');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value;
            
            if (query.trim() === '') {
                const resultsDropdown = document.getElementById('search-results');
                if (resultsDropdown) {
                    resultsDropdown.style.display = 'none';
                }
                return;
            }
            
            searchTimeout = setTimeout(() => {
                const results = searchAssets(query);
                displaySearchResults(results);
            }, 300); // Debounce de 300ms
        });
        
        // Esconder dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                const resultsDropdown = document.getElementById('search-results');
                if (resultsDropdown) {
                    resultsDropdown.style.display = 'none';
                }
            }
        });
    }
    
    // Carregar dados iniciais imediatamente
    refreshData();
    
    // Atualizar a cada 3 segundos (tempo real)
    refreshInterval = setInterval(() => {
        console.log('🔄 Atualização automática...');
        refreshData();
    }, 3000);
    
    // Também atualizar quando a página ganha foco
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👁️ Página visível, atualizando dados...');
            refreshData();
        }
    });
});

// Limpar intervalo ao sair da página
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});

