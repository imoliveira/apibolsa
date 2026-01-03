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

// Função para criar linha da tabela
function createTableRow(data) {
    const variationClass = getVariationClass(data.variation);
    const percentClass = getVariationClass(data.percent);
    const timeClass = variationClass; // Usar mesma classe para cor do ícone
    
    // Formatar variação com sinal
    const variation = data.variation || '0.00';
    const variationFormatted = parseFloat(variation) >= 0 ? 
        `+${formatNumber(variation)}` : formatNumber(variation);
    
    // Formatar valor com separador de milhar
    const formatValue = (val) => {
        if (!val || val === '0.00' || val === '0') return '0.00';
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        // Se o número for muito grande, usar separador de milhar
        if (num >= 1000) {
            return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return num.toFixed(2);
    };
    
    return `
        <div class="table-row">
            <div class="table-cell cell-name">${data.name}</div>
            <div class="table-cell cell-mes">${data.mes || ''}</div>
            <div class="table-cell cell-value">${formatValue(data.value)}</div>
            <div class="table-cell cell-value">${formatValue(data.max || data.value)}</div>
            <div class="table-cell cell-value">${formatValue(data.min || data.value)}</div>
            <div class="table-cell cell-variation ${variationClass}">${variationFormatted}</div>
            <div class="table-cell cell-percent ${percentClass}">${formatPercent(data.percent)}</div>
            <div class="table-cell cell-time ${timeClass}">${data.time || ''}</div>
        </div>
    `;
}

// Função para renderizar tabela
function renderTable(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="table-loading">Sem dados disponíveis</div>';
        return;
    }
    
    // Criar header da tabela
    const header = `
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
    
    const rows = data.map(item => createTableRow(item)).join('');
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
        const response = await fetch('/api/finance/dashboard', {
            credentials: 'include' // Incluir cookies para autenticação
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
        if (data.treasuries) renderTable('treasuries-table', data.treasuries);
        if (data.asiaOceania) renderTable('asia-oceania-table', data.asiaOceania);
        if (data.moedas) renderTable('moedas-table', data.moedas);
        if (data.dolarAmericas) renderTable('dolar-americas-table', data.dolarAmericas);
        if (data.criptomoedas) renderTable('criptomoedas-table', data.criptomoedas);
        
        // Atualizar timestamp
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
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
            lastUpdate.style.color = '#f44336';
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

// Inicializar dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 Dashboard inicializado');
    
    // Inicializar relógio
    updateClock();
    setInterval(updateClock, 1000); // Atualizar a cada segundo
    
    // Inicializar abas
    initTabs();
    
    // Carregar dados iniciais imediatamente
    refreshData();
    
    // Atualizar a cada 10 segundos (mais frequente)
    refreshInterval = setInterval(() => {
        console.log('🔄 Atualização automática...');
        refreshData();
    }, 10000);
    
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

