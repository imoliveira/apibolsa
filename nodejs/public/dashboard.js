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

// Função para criar linha da tabela do Brazilian Real (com valor inverso)
function createBrazilianRealRow(data) {
    const variationClass = getVariationClass(data.variation);
    const percentClass = getVariationClass(data.percent);
    const timeClass = variationClass;
    
    // Formatar variação com sinal
    const variation = data.variation || '0.00';
    const variationFormatted = parseFloat(variation) >= 0 ? 
        `+${formatNumber(variation, 4)}` : formatNumber(variation, 4);
    
    // Valores para Último, Máxima e Mínima
    const value = data.value || '0.0000';
    const max = data.max || value;
    const min = data.min || value;
    
    return `
        <div class="table-row brazilian-real-row">
            <div class="table-cell cell-name">${data.name}</div>
            <div class="table-cell cell-mes">${data.mes || ''}</div>
            ${createValueWithInverseCell(value)}
            ${createValueWithInverseCell(max)}
            ${createValueWithInverseCell(min)}
            <div class="table-cell cell-variation ${variationClass}">${variationFormatted}</div>
            <div class="table-cell cell-percent ${percentClass}">${formatPercent(data.percent)}</div>
            <div class="table-cell cell-time ${timeClass}">${data.time || ''}</div>
        </div>
    `;
}

// Função para criar linha da tabela
function createTableRow(data, isCurrency = false) {
    const variationClass = getVariationClass(data.variation);
    const percentClass = getVariationClass(data.percent);
    const timeClass = variationClass; // Usar mesma classe para cor do ícone
    
    // Formatar variação com sinal
    const variation = data.variation || '0.00';
    // Para moedas/futuros, usar mais casas decimais na variação
    const variationDecimals = isCurrency ? 4 : 2;
    const variationFormatted = parseFloat(variation) >= 0 ? 
        `+${formatNumber(variation, variationDecimals)}` : formatNumber(variation, variationDecimals);
    
    return `
        <div class="table-row">
            <div class="table-cell cell-name">${data.name}</div>
            <div class="table-cell cell-mes">${data.mes || ''}</div>
            <div class="table-cell cell-value">${formatValue(data.value, isCurrency)}</div>
            <div class="table-cell cell-value">${formatValue(data.max || data.value, isCurrency)}</div>
            <div class="table-cell cell-value">${formatValue(data.min || data.value, isCurrency)}</div>
            <div class="table-cell cell-variation ${variationClass}">${variationFormatted}</div>
            <div class="table-cell cell-percent ${percentClass}">${formatPercent(data.percent)}</div>
            <div class="table-cell cell-time ${timeClass}">${data.time || ''}</div>
        </div>
    `;
}

// Função para renderizar tabela
function renderTable(containerId, data, isCurrency = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="table-loading">Sem dados disponíveis</div>';
        return;
    }
    
    // Detectar se é Brazilian Real ou outras moedas baseado no containerId
    const isBrazilianReal = containerId === 'dolar-americas-table';
    if (containerId === 'dolar-americas-table' || containerId.includes('real') || containerId.includes('moedas')) {
        isCurrency = true;
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
    
    // Usar função específica para Brazilian Real, caso contrário usar função genérica
    const rows = isBrazilianReal 
        ? data.map(item => createBrazilianRealRow(item)).join('')
        : data.map(item => createTableRow(item, isCurrency)).join('');
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
        if (data.treasuries) renderTable('treasuries-table', data.treasuries);
        if (data.asiaOceania) renderTable('asia-oceania-table', data.asiaOceania);
        if (data.moedas) renderTable('moedas-table', data.moedas);
        if (data.dolarAmericas) renderTable('dolar-americas-table', data.dolarAmericas);
        if (data.criptomoedas) renderTable('criptomoedas-table', data.criptomoedas);
        
        // Atualizar timestamp
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
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

