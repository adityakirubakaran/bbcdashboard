import { parseExcel, processData, processSalesData } from './dataParser';
import { renderCharts } from './chartConfig';

window.appDatasets = [];

const uploadInput = document.getElementById('excel-upload');
const noDataPlaceholder = document.getElementById('no-data-placeholder');
const mainChartCanvas = document.getElementById('main-chart');

uploadInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = await parseExcel(file);
    window.appDatasets.push({
      id: Date.now().toString(),
      name: file.name,
      type: data.type,
      rawRows: data.rawRows,
      rawHeaders: data.rawHeaders,
      uniqueSites: data.uniqueSites || [],
      uniqueCategories: data.uniqueCategories || []
    });
    
    renderDatasetManager();
    updateDashboard();
  } catch (err) {
    console.error("Error parsing the excel file:", err);
    alert("There was an error parsing the uploaded file. Please ensure it is the correct format.");
  }
  
  // reset input so same file can be uploaded if needed
  e.target.value = '';
});

function renderDatasetManager() {
    const container = document.getElementById('uploaded-sheets');
    container.innerHTML = '';
    
    window.appDatasets.forEach(ds => {
        const pill = document.createElement('div');
        pill.className = 'dataset-pill';
        pill.innerHTML = `
            <span>${ds.name}</span>
            <button class="dataset-pill-remove" aria-label="Remove dataset">×</button>
        `;
        
        pill.querySelector('.dataset-pill-remove').addEventListener('click', () => {
            window.appDatasets = window.appDatasets.filter(d => d.id !== ds.id);
            renderDatasetManager();
            updateDashboard();
        });
        
        container.appendChild(pill);
    });
}

function populateFilters(sites, categories) {
    const locContainer = document.getElementById('location-filters-list');
    const catContainer = document.getElementById('category-filters-list');
    
    // Clear existing
    if(locContainer) locContainer.innerHTML = '';
    if(catContainer) catContainer.innerHTML = '';

    sites.forEach(site => {
        const item = document.createElement('div');
        item.className = 'dropdown-item selected';
        item.textContent = site;
        item.dataset.value = site;
        
        item.addEventListener('click', () => {
            item.classList.toggle('selected');
            updateDashboard();
        });
        locContainer.appendChild(item);
    });

    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'dropdown-item selected';
        item.textContent = cat;
        item.dataset.value = cat;
        
        item.addEventListener('click', () => {
            item.classList.toggle('selected');
            updateDashboard();
        });
        catContainer.appendChild(item);
    });
}


function updateDashboard() {
    if (window.appDatasets.length === 0) {
        noDataPlaceholder.style.display = 'flex';
        document.getElementById('view-controls').style.display = 'none';
        document.getElementById('charts-wrapper').style.display = 'none';
        
        document.getElementById('location-filters-list').innerHTML = '';
        document.getElementById('category-filters-list').innerHTML = '';
        
        // Reset metrics
        document.getElementById('metric-diversion-rate').textContent = "--%";
        document.getElementById('metric-total-waste').textContent = "--T";
        document.getElementById('metric-landfill').textContent = "--T";
        document.getElementById('insights-container').innerHTML = `<div class="insight-item"><span class="insight-number">1</span><p>Awaiting data upload to generate insights.</p></div>`;
        return;
    }

    // Combine row data by type
    let allWasteRows = [];
    let wasteHeaders = [];
    let allSites = new Set();
    let allCats = new Set();
    
    let allSalesRows = [];
    let salesHeaders = [];

    window.appDatasets.forEach(d => {
        if (d.type === 'waste') {
            allWasteRows = allWasteRows.concat(d.rawRows);
            if (wasteHeaders.length === 0) wasteHeaders = d.rawHeaders;
            d.uniqueSites.forEach(s => allSites.add(s));
            d.uniqueCategories.forEach(c => allCats.add(c));
        } else if (d.type === 'sales') {
            allSalesRows = allSalesRows.concat(d.rawRows);
            if (salesHeaders.length === 0) salesHeaders = d.rawHeaders;
        }
    });

    // Populate filters only if they haven't been populated with these sets yet
    // For simplicity, we just rebuild if the UI is completely empty or sizes changed. 
    // Doing it completely dynamically is tricky without resetting user choices. 
    // For now we will just populate if it's empty, or append if new.
    const locContainer = document.getElementById('location-filters-list');
    const catContainer = document.getElementById('category-filters-list');
    if (locContainer.children.length === 0 && allSites.size > 0) {
        populateFilters(Array.from(allSites), Array.from(allCats));
    }

    // 1. Get current filters
    const selectedSites = Array.from(document.querySelectorAll('#location-filters-list .dropdown-item.selected')).map(el => el.dataset.value);
    const selectedCats = Array.from(document.querySelectorAll('#category-filters-list .dropdown-item.selected')).map(el => el.dataset.value);

    let filteredWasteData = { timeline: [], metrics: { diversionRate: 0, totalWaste: 0, totalLandfill: 0 }, uniqueCategories: [], topLocations: [], insights: [] };
    if (allWasteRows.length > 0) {
        filteredWasteData = processData(allWasteRows, wasteHeaders, { sites: selectedSites, categories: selectedCats });
    }

    let processedSalesData = { categories: [], totalRevenue: 0 };
    if (allSalesRows.length > 0) {
        processedSalesData = processSalesData(allSalesRows, salesHeaders);
    }
    
    // 3. Update Chart
    noDataPlaceholder.style.display = 'none';
    document.getElementById('view-controls').style.display = 'flex';
    document.getElementById('charts-wrapper').style.display = 'flex';
    renderCharts(filteredWasteData.timeline, filteredWasteData.uniqueCategories, filteredWasteData.topLocations, processedSalesData);

    // 4. Update Metrics Box
    document.getElementById('metric-diversion-rate').textContent = filteredWasteData.metrics.diversionRate.toFixed(1) + "%";
    document.getElementById('metric-total-waste').textContent = Math.round(filteredWasteData.metrics.totalWaste).toLocaleString() + " T";
    document.getElementById('metric-landfill').textContent = Math.round(filteredWasteData.metrics.totalLandfill).toLocaleString() + " T";
    
    // 5. Update Insights
    window.currentInsightsMap = {
        'chart-category': [],
        'chart-disposition-detailed': [],
        'chart-disposition-diverted': [],
        'chart-locations': [],
        'chart-sales': []
    };
    
    if (processedSalesData.insights) {
        Object.assign(window.currentInsightsMap, processedSalesData.insights);
    }
    if (filteredWasteData.insights) {
        for (const [k, v] of Object.entries(filteredWasteData.insights)) {
            if (!window.currentInsightsMap[k]) window.currentInsightsMap[k] = [];
            window.currentInsightsMap[k] = window.currentInsightsMap[k].concat(v);
        }
    }
    
    renderInsights();
}

let currentInsightsMap = {
    'chart-category': [],
    'chart-disposition-detailed': [],
    'chart-disposition-diverted': [],
    'chart-locations': [],
    'chart-sales': []
};
window.currentInsightsMap = currentInsightsMap;

function renderInsights() {
    const container = document.getElementById('insights-container');
    container.innerHTML = "";
    
    let targetId = 'chart-category';
    const activeViewItem = document.querySelector('#visualization-list .dropdown-item.selected');
    if (activeViewItem) targetId = activeViewItem.dataset.value;

    let displayInsights = window.currentInsightsMap[targetId] || [];
    displayInsights = displayInsights.slice(0, 2); // Max 2 insights
    
    if (displayInsights.length > 0) {
        displayInsights.forEach((insightText, i) => {
            const div = document.createElement('div');
            div.className = 'insight-item';
            div.innerHTML = `
                <span class="insight-number">${i + 1}</span>
                <p>${insightText}</p>
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = "<p>No significant insights found for the current data selection and visualization view.</p>";
    }
}

// UI Toggles
document.getElementById('visualization-dropdown-btn').addEventListener('click', () => {
    const list = document.getElementById('visualization-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('#visualization-list .dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('#visualization-list .dropdown-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        
        document.getElementById('visualization-list').style.display = 'none';
        document.getElementById('current-view-name').textContent = item.textContent;
        
        const targetId = item.dataset.value;
        document.querySelectorAll('.view-screen').forEach(el => {
            if (el.id === targetId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
        
        const chartMap = {
            'chart-category': window.char1,
            'chart-disposition-diverted': window.char2,
            'chart-locations': window.char3,
            'chart-disposition-detailed': window.char4,
            'chart-sales': window.char5
        };
        const activeChart = chartMap[targetId];
        if (activeChart) {
            setTimeout(() => {
                activeChart.reset();
                activeChart.update();
            }, 15);
        }
        
        manageFiltersVisibility(targetId);
        renderInsights(); // Re-render insights natively bound to this newly active view
    });
});

document.getElementById('category-dropdown-btn').addEventListener('click', () => {
    const list = document.getElementById('category-filters-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('location-dropdown-btn').addEventListener('click', () => {
    const list = document.getElementById('location-filters-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
});

function manageFiltersVisibility(viewId) {
    const defaultFiltersMap = {
        'chart-category': ['location', 'category'], 
        'chart-disposition-detailed': ['location'], 
        'chart-disposition-diverted': ['location', 'category'], 
        'chart-locations': ['category'], 
        'chart-sales': [] 
    };
    
    const activeFilters = defaultFiltersMap[viewId] || [];
    
    const catSection = document.getElementById('category-dropdown').parentElement;
    const locSection = document.getElementById('location-dropdown').parentElement;
    
    let anyVisible = false;
    
    if (activeFilters.includes('category')) {
        catSection.style.display = 'block';
        anyVisible = true;
    } else {
        catSection.style.display = 'none';
    }
    
    if (activeFilters.includes('location')) {
        locSection.style.display = 'block';
        anyVisible = true;
    } else {
        locSection.style.display = 'none';
    }
    
    let noFiltersMsg = document.getElementById('no-filters-msg');
    if (!noFiltersMsg) {
        noFiltersMsg = document.createElement('p');
        noFiltersMsg.id = 'no-filters-msg';
        noFiltersMsg.textContent = 'No filters available for this visualization.';
        noFiltersMsg.style.color = 'var(--bbc-text-secondary)';
        noFiltersMsg.style.fontSize = '13px';
        noFiltersMsg.style.padding = '8px 0';
        catSection.parentElement.appendChild(noFiltersMsg);
    }
    noFiltersMsg.style.display = anyVisible ? 'none' : 'block';
}

// Init run
manageFiltersVisibility('chart-category');
