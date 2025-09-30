// Firebase 모듈 import (ES6 modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, Bytes } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI Elements ---
const ui = {
    appContainer: document.getElementById('app-container'),
    fileUpload: document.getElementById('file-upload'),
    tableBody: document.getElementById('data-table-body'),
    tableHeader: document.querySelector('#data-table thead'),
    placeholderRow: document.getElementById('placeholder-row'),
    loaderContainer: document.getElementById('loader-container'),
    statusIndicator: document.getElementById('status-indicator'),
    lastUpdatedEl: document.getElementById('last-updated'),
    lastUploaderEl: document.getElementById('last-uploader'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleDesktop: document.getElementById('sidebar-toggle-desktop'),
    sidebarToggleMobile: document.getElementById('sidebar-toggle-mobile'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    floorFilters: document.getElementById('floor-filters'),
    packTypeFilters: document.getElementById('pack-type-filters'),
    hourFilters: document.getElementById('hour-filters'),
    searchInput: document.getElementById('search-input'),
    lowHtpToggle: document.getElementById('low-htp-toggle'),
    statsDisplay: document.getElementById('stats-display'),
    captureBtn: document.getElementById('capture-btn'),
    exportBtn: document.getElementById('export-btn'),
    targetHtpSettings: document.getElementById('target-htp-settings'),
    tickerText: document.getElementById('ticker-text'),
    tableViewBtn: document.getElementById('table-view-btn'),
    dashboardViewBtn: document.getElementById('dashboard-view-btn'),
    tableView: document.getElementById('table-view'),
    dashboardView: document.getElementById('dashboard-view'),
    chartModalBackdrop: document.getElementById('chart-modal-backdrop'),
    chartModalTitle: document.getElementById('chart-modal-title'),
    chartModalClose: document.getElementById('chart-modal-close'),
    kpi: {
        totalWorkers: document.getElementById('kpi-total-workers'),
        totalQty: document.getElementById('kpi-total-qty'),
        avgHtp: document.getElementById('kpi-avg-htp'),
        lowPerformers: document.getElementById('kpi-low-performers'),
    },
    topPickPerformersList: document.getElementById('top-pick-performers-list'),
    topPackPerformersList: document.getElementById('top-pack-performers-list'),
};

// --- Global State ---
let globalRawData = []; 
let state = {
    filters: {
        process: 'all', search: '', lowHtp: false,
        hours: new Set(), floors: new Set(), packTypes: new Set()
    },
    sort: {
        key: 'htp',
        direction: 'asc'
    },
    charts: {
        floorHtp: null,
        packType: null,
        individualHtp: null,
        processComparison: null,
        hourlyHtp: null,
    }
};
let targetHtpValues = {};

// --- Firebase Setup ---
const firebaseConfig = {
    apiKey: "AIzaSyBrPfjJWPPd8HzI1jCRoHFqwcuPuJ9u10E",
    authDomain: "gwj2-pickpack-htptool.firebaseapp.com",
    projectId: "gwj2-pickpack-htptool",
    storageBucket: "gwj2-pickpack-htptool.appspot.com",
    messagingSenderId: "913661158847",
    appId: "1:913661158847:web:ebaf60d2afbeadda452d0a",
    measurementId: "G-77DRPC5F58"
};

let db, auth, userId, dataDocRef;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    dataDocRef = doc(db, 'artifacts', firebaseConfig.projectId, 'public', 'data', 'htpData', 'latestCompressed');
} catch(e) {
    console.error("Firebase 초기화 오류:", e);
    updateStatus('disconnected', 'Firebase 초기화에 실패했습니다.');
}

// --- Constants ---
const PACK_TYPE_MAP = {
    "메뉴얼팩": "179_1.3F_MA_S_OG_", "메뉴얼팩 멀티": "179_1.3F_MA_M_OG_", "ACE LINE": "179-1.2F-MA-ACE-OG-",
    "오토백 1.2": "179_1.3F_AB_R1.2_OG_", "오토백 2.5": "179_1.3F_AB_R2.5_OG_", "오토백 4.0": "179_1.3F_AB_R4.0_OG_",
    "오토백 RTPB": "179_1.3F_AB_T1_OG_", "오토백 멀티": "179_1.3F_AB_M_OG_", "CFC 메뉴얼팩": "190_6.2F_MA_S_OG_",
    "CFC 메뉴얼팩 멀티": "190_6.2F_MA_M_OG_", "CFC 오토백 2.5": "190_6.2F_AB_R2.5_OG_", "CFC 오토백 4.0": "190_6.2F_AB_R4.0_OG_",
    "CFC 오토백 RTPB": "190_6.2G_AB_T1_OG_"
};
const DEFAULT_PACK_TYPE = "기타";
const MANAGERS_LIST = ['26485305', '94354606', '66476877', '21284456', '24856615', '21019991', '87406548', '29801698'];

const TARGET_HTP_DEFAULTS = {
    "Manual SINGULATION": { value: 100, keywords: ['ManualPack', '179_1.3F_MA_S_OG_'] },
    "Manual MULTI": { value: 120, keywords: ['7F_Multi_AGV', '179_1.3F_MA_M_OG_'] },
    "ACE LINE": { value: 150, keywords: ['ACE', '179-1.2F-MA-ACE-OG-'] },
    "Autobagger 1.2": { value: 380, keywords: ['Autobag1.2', '179_1.3F_AB_R1.2_OG_'] },
    "Autobagger 2.5": { value: 350, keywords: ['Autobag2.5', '179_1.3F_AB_R2.5_OG_'] },
    "Autobagger 4.0": { value: 280, keywords: ['Autobag4.0', '179_1.3F_AB_R4.0_OG_'] },
    "Autobagger RTPB": { value: 150, keywords: ['Autobag_RTPB1', '179_1.3F_AB_T1_OG_'] },
    "Auto MULTI": { value: 250, keywords: ['AGV_Multi_Autobag4.0', '179_1.3F_AB_M_OG_'] },
    "CFC Manual S": { value: 100, keywords: ['190_6.2F_MA_S_OG_'] },
    "CFC Manual M": { value: 120, keywords: ['190_6.2F_MA_M_OG_'] },
    "CFC Autobag 2.5": { value: 350, keywords: ['190_6.2F_AB_R2.5_OG_'] },
    "CFC Autobag 4.0": { value: 280, keywords: ['190_6.2F_AB_R4.0_OG_'] },
    "CFC Autobag RTPB": { value: 150, keywords: ['190_6.2G_AB_T1_OG_'] },
    "PICK": { value: 90, keywords: [] }
};

for(const key in TARGET_HTP_DEFAULTS) {
    targetHtpValues[key] = TARGET_HTP_DEFAULTS[key].value;
}

// Chart.js 플러그인 등록
Chart.register(ChartDataLabels);

// --- Firebase Auth & Realtime Listener ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        updateStatus('connected', '실시간 서버에 연결되었습니다.');
        ui.fileUpload.disabled = false;
        setupRealtimeListener();
    } else {
        try { 
            await signInAnonymously(auth); 
        } catch (error) {
            console.error("익명 로그인 오류:", error);
            updateStatus('disconnected', '서버에 연결할 수 없습니다.');
        }
    }
});

function setupRealtimeListener() {
    onSnapshot(dataDocRef, (docSnap) => {
        showLoader();
        if (docSnap.exists()) {
            const dataPayload = docSnap.data();
            try {
                const compressedBytes = dataPayload.compressedData;
                if (!compressedBytes) throw new Error("압축된 데이터가 없습니다.");

                const compressedUint8Array = compressedBytes.toUint8Array();
                const decompressedString = pako.ungzip(compressedUint8Array, { to: 'string' });
                const parsedData = JSON.parse(decompressedString); 

                globalRawData = parsedData.map(item => ({
                    ...item,
                    htpStart: new Date(item.htpStart),
                    htpEnd: new Date(item.htpEnd),
                }));

                ui.lastUploaderEl.textContent = dataPayload.uploaderId.substring(0, 8) + '...';
                ui.lastUpdatedEl.textContent = new Date(dataPayload.timestamp).toLocaleString('ko-KR');
                
                initializeFiltersFromData(globalRawData);
                applyFiltersAndRender();
            } catch (error) {
                console.error("데이터 처리 오류:", error);
                showModal("데이터 처리 실패", "error");
                globalRawData = [];
                applyFiltersAndRender();
            }
        } else {
            globalRawData = [];
            initializeFiltersFromData([]);
            applyFiltersAndRender();
        }
        hideLoader();
    }, (error) => {
        console.error("실시간 데이터 수신 오류:", error);
        updateStatus('disconnected', '데이터 수신 중 오류 발생');
        hideLoader();
    });
}

// --- Event Listeners ---
function toggleMobileSidebar() {
    const isOpen = ui.sidebar.classList.toggle('open');
    ui.sidebarOverlay.classList.toggle('hidden', !isOpen);
}

function toggleDesktopSidebar() {
    ui.appContainer.classList.toggle('sidebar-collapsed');
}

ui.sidebarToggleMobile.addEventListener('click', toggleMobileSidebar);
ui.sidebarToggleDesktop.addEventListener('click', toggleDesktopSidebar);
ui.sidebarOverlay.addEventListener('click', toggleMobileSidebar);

ui.fileUpload.addEventListener('change', handleFileUpload);
ui.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    applyFiltersAndRender();
});

ui.lowHtpToggle.addEventListener('change', (e) => {
    state.filters.lowHtp = e.target.checked;
    applyFiltersAndRender();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.filters.process = e.currentTarget.id.replace('filter-', '');
        applyFiltersAndRender();
    });
});

ui.captureBtn.addEventListener('click', captureTable);
ui.exportBtn.addEventListener('click', exportToExcel);

ui.tableHeader.addEventListener('click', (e) => {
    const headerCell = e.target.closest('.sortable');
    if (!headerCell) return;

    const sortKey = headerCell.dataset.sortKey;
    if (state.sort.key === sortKey) {
        if (state.sort.direction === 'asc') state.sort.direction = 'desc';
        else if (state.sort.direction === 'desc') {
            state.sort.key = 'htp'; 
            state.sort.direction = 'asc';
        }
    } else {
        state.sort.key = sortKey;
        state.sort.direction = 'asc';
    }
    applyFiltersAndRender();
});

// View switcher
ui.tableViewBtn.addEventListener('click', () => {
    ui.tableView.classList.remove('hidden');
    ui.dashboardView.classList.add('hidden');
    ui.tableViewBtn.classList.add('active');
    ui.dashboardViewBtn.classList.remove('active');
});

ui.dashboardViewBtn.addEventListener('click', () => {
    ui.tableView.classList.add('hidden');
    ui.dashboardView.classList.remove('hidden');
    ui.dashboardViewBtn.classList.add('active');
    ui.tableViewBtn.classList.remove('active');
});

// Chart Modal
ui.tableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row || row.id === 'placeholder-row') return;
    const employeeCell = row.querySelector('td:nth-child(2)');
    const processCell = row.querySelector('td:nth-child(1)');
    if(employeeCell && processCell) {
        const employeeName = employeeCell.textContent.replace(/[👑]\s*/g, '');
        const processType = processCell.textContent;
        showIndividualTrend(employeeName, processType);
    }
});

ui.chartModalClose.addEventListener('click', () => {
    ui.chartModalBackdrop.classList.remove('active');
});

// --- Data Processing Functions ---
function getPackType(location, processTask, processPathName) {
    if (processTask === 'PACK(PACKING)' && processPathName.includes('AGV_Multi_Autobag4.0') && location.startsWith('Pack at Rebin (Test')) {
        return "오토백 멀티";
    }
    if (typeof location !== 'string') return DEFAULT_PACK_TYPE;
    for (const [name, prefix] of Object.entries(PACK_TYPE_MAP)) {
        if (location.startsWith(prefix)) return name;
    }
    return DEFAULT_PACK_TYPE;
}

function getTargetHtp(item) {
    if (item.processType.includes('PICK')) {
        return targetHtpValues['PICK'] || 0;
    }
    if (item.processType.includes('PACK')) {
        const processPathName = item.processPathName || "";
        for (const name in TARGET_HTP_DEFAULTS) {
            if (name === "PICK") continue;
            const config = TARGET_HTP_DEFAULTS[name];
            if (config.keywords.some(keyword => processPathName.includes(keyword))) {
                return targetHtpValues[name] || 0;
            }
        }
        return targetHtpValues["Manual SINGULATION"] || 0;
    }
    return 0;
}

function parseExcelData(data) {
    if (data.length < 2) return [];
    const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : '');
    const COLS_TO_LOAD = {
        workDate: 'work date', employee: 'employee', unitQty: 'unit qty', location: 'location', floor: 'floor',
        processPathName: 'process path name', htpStart: 'htp start', htpEnd: 'htp end', processTask: 'process(task)',
        contractType: 'contract type'
    };
    const colIndices = {};
    const missingCols = [];
    for (const key in COLS_TO_LOAD) {
        const index = headers.indexOf(COLS_TO_LOAD[key]);
        if (index === -1 && key !== 'contractType') {
            missingCols.push(COLS_TO_LOAD[key]);
        }
        colIndices[key] = index;
    }
    if (missingCols.length > 0) throw new Error(`엑셀 파일에 다음 필수 컬럼이 없습니다:\n[${missingCols.join(', ')}]`);

    const rawData = data.slice(1).map(row => {
        const combineDateTime = (dateValue, timeValue) => {
            if (!dateValue || !timeValue) return null;
            let datePart = (typeof dateValue === 'number') ? new Date(Date.UTC(1899, 11, 30) + dateValue * 24 * 60 * 60 * 1000) : new Date(dateValue);
            if (isNaN(datePart.getTime())) return null;
            let timePart;
            if (typeof timeValue === 'number') timePart = new Date(Date.UTC(1899, 11, 30) + timeValue * 24 * 60 * 60 * 1000);
            else if (typeof timeValue === 'string') {
                const parts = timeValue.split(':');
                timePart = new Date(0);
                timePart.setUTCHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
            } else timePart = timeValue;
            if (isNaN(timePart.getTime())) return null;
            return new Date(Date.UTC(datePart.getUTCFullYear(), datePart.getUTCMonth(), datePart.getUTCDate(), timePart.getUTCHours(), timePart.getUTCMinutes(), timePart.getUTCSeconds()));
        };
        const htpStart = combineDateTime(row[colIndices.workDate], row[colIndices.htpStart]);
        const htpEnd = combineDateTime(row[colIndices.workDate], row[colIndices.htpEnd]);
        if (!htpStart || !htpEnd) return null;
        
        const durationSeconds = (htpEnd - htpStart) / 1000;
        if (durationSeconds <= 0) return null;

        let processTask = row[colIndices.processTask] || '';
        const location = row[colIndices.location] || '';
        const processPathName = row[colIndices.processPathName] || '';

        if (processTask === 'REBIN(REBIN)' && location.startsWith('Pack at Rebin (Test') && processPathName === '0. AGV_Multi_Autobag4.0 + 일반존 통합') {
            processTask = 'PACK(PACKING)';
        }

        return {
            employee: row[colIndices.employee] || '', unitQty: parseInt(row[colIndices.unitQty] || 0),
            location: location, floor: row[colIndices.floor] || '',
            processPathName: processPathName, processTask: processTask,
            contractType: colIndices.contractType !== -1 ? (row[colIndices.contractType] || '').toUpperCase() : '',
            htpStart: htpStart, htpEnd: htpEnd
        };
    }).filter(item => {
        if (!item || !item.employee || item.unitQty <= 0) return false;
        if (item.employee === 'AGV_Agent') return false;
        return item.processTask === 'PICK(PICKING)' || item.processTask === 'PACK(PACKING)';
    });
    
    return rawData;
}

function aggregateData(rawData) {
    const aggregatedMap = new Map();

    rawData.forEach(item => {
        let key;
        let packType = null;

        if (item.processTask === 'PICK(PICKING)') {
            key = `${item.employee}|${item.floor}|PICK`;
            packType = '집품';
        } else {
            packType = getPackType(item.location, item.processTask, item.processPathName);
            key = `${item.employee}|${packType}|PACK`;
        }

        const durationSeconds = (item.htpEnd - item.htpStart) / 1000;
        if (durationSeconds <= 0) return; 

        if (!aggregatedMap.has(key)) {
            const empIdMatch = item.employee.match(/\((.*?)\)/);
            const empId = empIdMatch ? empIdMatch[1] : '';
            aggregatedMap.set(key, {
                processType: item.processTask.includes('PICK') ? 'PICK(집품)' : 'PACK(포장)',
                employee: item.employee,
                floor: item.floor,
                unitQty: 0,
                totalSeconds: 0,
                location: item.location,
                processPathName: item.processPathName,
                packType: packType,
                isManager: MANAGERS_LIST.includes(empId),
                isPerm: item.contractType === 'PERM'
            });
        }

        const group = aggregatedMap.get(key);
        group.unitQty += item.unitQty;
        group.totalSeconds += durationSeconds;
        group.location = item.location;
        group.processPathName = item.processPathName;
        group.floor = item.floor;
    });

    const finalData = [];
    for (const group of aggregatedMap.values()) {
        const mh = group.totalSeconds > 0 ? group.totalSeconds / 3600 : 0;
        finalData.push({
            ...group,
            mh: mh.toFixed(4),
            htp: (mh > 0 ? group.unitQty / mh : 0).toFixed(1),
        });
    }

    return finalData;
}

function initializeFiltersFromData(rawData) {
    const allPackTypes = new Set();
    const floors = new Set();

    rawData.forEach(item => {
        if(item.processTask.includes('PICK')) {
            if(item.floor) floors.add(item.floor);
        } else if (item.processTask.includes('PACK')) {
            allPackTypes.add(getPackType(item.location, item.processTask, item.processPathName));
        }
    });
    
    createFilterCheckboxes(ui.packTypeFilters, Array.from(allPackTypes).sort(), 'packTypes', 'packtypes');
    createFilterCheckboxes(ui.floorFilters, Array.from(floors).sort(), 'floors', 'floors');
    createTimeFilters();
    createTargetHtpSettings();
}

function createTimeFilters() {
    const allHoursCheckbox = document.getElementById('all-hours-checkbox');
    ui.hourFilters.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, '0');
        const label = document.createElement('label');
        label.className = 'custom-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; 
        checkbox.value = i;
        checkbox.className = 'hour-checkbox';
        checkbox.addEventListener('change', (e) => {
            const hourVal = parseInt(e.target.value);
            if (e.target.checked) {
                state.filters.hours.add(hourVal);
                allHoursCheckbox.checked = false;
            } else {
                state.filters.hours.delete(hourVal);
            }
            if (state.filters.hours.size === 0) {
                allHoursCheckbox.checked = true;
            }
            applyFiltersAndRender();
        });
        const checkmark = document.createElement('span');
        checkmark.className = 'checkbox-mark';
        const text = document.createElement('span');
        text.textContent = hour;
        label.appendChild(checkbox);
        label.appendChild(checkmark);
        label.appendChild(text);
        ui.hourFilters.appendChild(label);
    }
    allHoursCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = false);
            state.filters.hours.clear();
            applyFiltersAndRender();
        }
    });
    document.getElementById('select-all-hours').addEventListener('click', () => {
        allHoursCheckbox.checked = false;
        document.querySelectorAll('.hour-checkbox').forEach(cb => {
            cb.checked = true;
            state.filters.hours.add(parseInt(cb.value));
        });
        applyFiltersAndRender();
    });
    document.getElementById('deselect-all-hours').addEventListener('click', () => {
        allHoursCheckbox.checked = true;
        document.querySelectorAll('.hour-checkbox').forEach(cb => cb.checked = false);
        state.filters.hours.clear();
        applyFiltersAndRender();
    });
}

function createFilterCheckboxes(container, items, filterType, type) {
    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'custom-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; 
        checkbox.value = item;
        checkbox.className = `${type}-checkbox`;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) state.filters[filterType].add(item);
            else state.filters[filterType].delete(item);
            applyFiltersAndRender();
        });
        const checkmark = document.createElement('span');
        checkmark.className = 'checkbox-mark';
        const text = document.createElement('span');
        text.textContent = item;
        label.appendChild(checkbox);
        label.appendChild(checkmark);
        label.appendChild(text);
        container.appendChild(label);
    });
    
    const selectAllBtn = document.getElementById(`select-all-${type}`);
    const deselectAllBtn = document.getElementById(`deselect-all-${type}`);

    if (selectAllBtn && deselectAllBtn) {
        selectAllBtn.onclick = () => {
            container.querySelectorAll('input').forEach(cb => { 
                cb.checked = true; 
                state.filters[filterType].add(cb.value); 
            });
            applyFiltersAndRender();
        };
        deselectAllBtn.onclick = () => {
            container.querySelectorAll('input').forEach(cb => { 
                cb.checked = false; 
                state.filters[filterType].delete(cb.value); 
            });
            applyFiltersAndRender();
        };
    }
}

function createTargetHtpSettings() {
    ui.targetHtpSettings.innerHTML = '';
    for (const key in TARGET_HTP_DEFAULTS) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between';
        const label = document.createElement('label');
        label.textContent = key + ':';
        label.style.fontSize = '0.875rem';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = targetHtpValues[key];
        input.className = 'modern-input w-20 text-right';
        input.style.padding = '0.5rem';
        input.addEventListener('change', (e) => {
            targetHtpValues[key] = parseFloat(e.target.value) || 0;
            applyFiltersAndRender();
        });
        div.appendChild(label);
        div.appendChild(input);
        ui.targetHtpSettings.appendChild(div);
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoader();
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            const parsedData = parseExcelData(jsonData);
            await saveDataToFirestore(parsedData);

        } catch (error) {
            console.error("파일 처리 오류:", error);
            showModal(error.message || "파일 처리 실패", "error");
            hideLoader();
        }
    };
    reader.onerror = (error) => { 
        console.error("파일 읽기 오류:", error); 
        showModal("파일을 읽을 수 없습니다.", "error"); 
        hideLoader(); 
    };
    reader.readAsArrayBuffer(file);
}

async function saveDataToFirestore(data) {
    try {
        const serializableData = data.map(item => ({
            ...item,
            htpStart: item.htpStart.toISOString(),
            htpEnd: item.htpEnd.toISOString(),
        }));
        const jsonString = JSON.stringify(serializableData);
        const compressedData = pako.gzip(jsonString);
        const compressedBytes = Bytes.fromUint8Array(compressedData);

        const payload = { 
            compressedData: compressedBytes, 
            uploaderId: userId, 
            timestamp: new Date().toISOString() 
        };
        
        await setDoc(dataDocRef, payload);
        showModal("데이터가 성공적으로 업로드되었습니다!", "success");
    } catch (error) {
        console.error("Firestore 저장 오류:", error);
        showModal("데이터 저장 실패", "error");
        hideLoader();
    }
}

function applyFiltersAndRender() {
    if (globalRawData.length === 0) {
        renderTable([]);
        updateDashboard([], []);
        return;
    };

    let timeFilteredRawData = [...globalRawData];
    if (state.filters.hours.size > 0) {
        timeFilteredRawData = timeFilteredRawData.filter(item => {
            const itemHour = item.htpStart.getUTCHours();
            return state.filters.hours.has(itemHour);
        });
    }
    
    let aggregatedData = aggregateData(timeFilteredRawData);

    let displayFilteredData = aggregatedData;
    if (state.filters.process === 'pick') {
        displayFilteredData = displayFilteredData.filter(item => item.processType === 'PICK(집품)');
    } else if (state.filters.process === 'pack') {
        displayFilteredData = displayFilteredData.filter(item => item.processType === 'PACK(포장)');
    }
    if (state.filters.search) displayFilteredData = displayFilteredData.filter(item => item.employee.toLowerCase().includes(state.filters.search));
    if (state.filters.lowHtp) displayFilteredData = displayFilteredData.filter(item => parseFloat(item.htp) < getTargetHtp(item));
    
    let finalDisplayData = displayFilteredData;
    if (state.filters.floors.size > 0 && state.filters.packTypes.size > 0) {
         finalDisplayData = displayFilteredData.filter(item => 
            (item.processType.includes('PICK') && state.filters.floors.has(item.floor)) ||
            (item.processType.includes('PACK') && state.filters.packTypes.has(item.packType))
        );
    } else if (state.filters.floors.size > 0) {
        finalDisplayData = displayFilteredData.filter(item => item.processType.includes('PICK') && state.filters.floors.has(item.floor));
    } else if (state.filters.packTypes.size > 0) {
        finalDisplayData = displayFilteredData.filter(item => item.processType.includes('PACK') && state.filters.packTypes.has(item.packType));
    }
    
    if (state.sort.key && state.sort.direction) {
        const numericKeys = ['unitQty', 'mh', 'htp'];
        finalDisplayData.sort((a, b) => {
            const key = state.sort.key;
            const valA = a[key];
            const valB = b[key];

            let compareResult;
            if (numericKeys.includes(key)) {
                compareResult = parseFloat(valA) - parseFloat(valB);
            } else {
                compareResult = (valA || '').toString().localeCompare((valB || '').toString());
            }

            return state.sort.direction === 'asc' ? compareResult : -compareResult;
        });
    }

    renderTable(finalDisplayData);
    updateDashboard(finalDisplayData, timeFilteredRawData);
    updateColumnVisibility(finalDisplayData);
    updateStats(finalDisplayData);
    updateTicker(finalDisplayData);
    updateSortIndicators();
}

function renderTable(data) {
    ui.tableBody.innerHTML = '';
    if (data.length === 0) {
        ui.tableBody.appendChild(ui.placeholderRow);
        ui.placeholderRow.classList.remove('hidden');
        updateStats([]);
        updateTicker([]);
        return;
    }
    ui.placeholderRow.classList.add('hidden');

    data.forEach(item => {
        const row = document.createElement('tr');
        
        let processTypeColor = item.processType.includes('PICK') ? 'color: #60a5fa' : 'color: #fbbf24';
        const targetHtp = getTargetHtp(item);
        let htpColor = parseFloat(item.htp) < targetHtp ? 'color: #f87171' : 'color: #34d399';
        
        let empDisplay = item.employee;
        let empStyle = '';

        if (item.isManager) {
            empDisplay = `👑 ${item.employee}`;
            empStyle = 'color: #fde047; font-weight: bold;';
        } else if (item.isPerm) {
            empStyle = 'color: #86efac;';
        }

        row.innerHTML = `
            <td style="padding: 1rem; font-weight: 500; ${processTypeColor}">${item.processType}</td>
            <td style="padding: 1rem; ${empStyle}">${empDisplay}</td>
            <td style="padding: 1rem;">${item.unitQty}</td>
            <td style="padding: 1rem;">${item.location || '-'}</td>
            <td style="padding: 1rem;">${item.processPathName || '-'}</td>
            <td style="padding: 1rem;">${item.packType}</td>
            <td style="padding: 1rem;">${item.mh}</td>
            <td style="padding: 1rem; font-weight: bold; ${htpColor}">${parseFloat(item.htp) < targetHtp && targetHtp > 0 ? '🚨 ' : ''}${item.htp}</td>
        `;
        ui.tableBody.appendChild(row);
    });
}

function updateColumnVisibility(data) {
    const locationColHeader = ui.tableHeader.querySelector('th[data-sort-key="location"]');
    if (!locationColHeader) return;
    
    const locationColIndex = Array.from(locationColHeader.parentNode.children).indexOf(locationColHeader);
    const isLocationEmpty = data.length > 0 && data.every(item => !item.location);
    
    document.querySelectorAll(`#data-table th:nth-child(${locationColIndex + 1}), #data-table td:nth-child(${locationColIndex + 1})`)
        .forEach(cell => {
            cell.classList.toggle('hidden-col', isLocationEmpty);
        });
}

function updateSortIndicators() {
    ui.tableHeader.querySelectorAll('.sortable').forEach(th => {
        const indicator = th.querySelector('.sort-indicator');
        const key = th.dataset.sortKey;
        indicator.classList.remove('asc', 'desc');
        indicator.textContent = '';
        if (key === state.sort.key && state.sort.direction) {
            indicator.classList.add(state.sort.direction);
            indicator.textContent = state.sort.direction === 'asc' ? '▲' : '▼';
        }
    });
}

function updateStats(data) {
    const visibleRows = data.length;
    const visibleWorkers = new Set(data.map(d => d.employee)).size;
    const totalQty = data.reduce((sum, d) => sum + d.unitQty, 0);
    const totalMh = data.reduce((sum, d) => sum + parseFloat(d.mh), 0);
    const avgHtp = totalMh > 0 ? (totalQty / totalMh).toFixed(2) : '0.00';

    ui.statsDisplay.innerHTML = `
        <span class="stats-item">표시 그룹: <strong>${visibleRows}</strong></span>
        <span class="stats-item">작업자 수: <strong>${visibleWorkers}</strong></span>
        <span class="stats-item">총 작업량: <strong>${totalQty.toLocaleString()}</strong></span>
        <span class="stats-item">평균 HTP: <strong>${avgHtp}</strong></span>`;
}

function updateTicker(data) {
    if (data.length === 0) {
        ui.tickerText.textContent = "Top/Low HTP 정보가 여기에 표시됩니다.";
        return;
    }
    const sortedByHtp = [...data].sort((a, b) => parseFloat(b.htp) - parseFloat(a.htp));
    const top3 = sortedByHtp.slice(0, 3);
    const low3 = sortedByHtp.filter(d => d.htp > 0).slice(-3).reverse();

    const formatTickerItem = (item) => `${item.employee.split('(')[0].trim()} (${item.htp})`;
    
    const topStr = "🏆Top3: " + (top3.length > 0 ? top3.map(formatTickerItem).join(', ') : '-');
    const lowStr = "🚨Low3: " + (low3.length > 0 ? low3.map(formatTickerItem).join(', ') : '-');
    
    ui.tickerText.textContent = `${topStr}        ${lowStr}`;
}

function captureTable() {
    const tableEl = document.getElementById('data-table');
    showModal('캡처 중...', 'info');
    html2canvas(tableEl).then(canvas => {
        canvas.toBlob(blob => {
            try {
                navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
                    .then(() => showModal('테이블이 클립보드에 복사되었습니다.', 'success'))
                    .catch(err => {
                        console.error('클립보드 복사 실패:', err);
                        showModal('클립보드 복사 실패', 'error');
                    });
            } catch (error) {
                 console.error('클립보드 API 오류:', error);
                 showModal('클립보드 API를 사용할 수 없습니다.', 'error');
            }
        });
    });
}

function exportToExcel() {
    if (globalRawData.length === 0) {
        showModal('내보낼 데이터가 없습니다.', 'error');
        return;
    };

    let timeFilteredRawData = [...globalRawData];
    if (state.filters.hours.size > 0) {
        timeFilteredRawData = timeFilteredRawData.filter(item => {
            const itemHour = item.htpStart.getUTCHours();
            return state.filters.hours.has(itemHour);
        });
    }
    
    let aggregatedData = aggregateData(timeFilteredRawData);

    let displayFilteredData = aggregatedData;
    if (state.filters.process === 'pick') {
        displayFilteredData = displayFilteredData.filter(item => item.processType === 'PICK(집품)');
    } else if (state.filters.process === 'pack') {
        displayFilteredData = displayFilteredData.filter(item => item.processType === 'PACK(포장)');
    }
    if (state.filters.search) displayFilteredData = displayFilteredData.filter(item => item.employee.toLowerCase().includes(state.filters.search));
    if (state.filters.lowHtp) displayFilteredData = displayFilteredData.filter(item => parseFloat(item.htp) < getTargetHtp(item));
    
    let dataToExport = displayFilteredData;
    if (state.filters.floors.size > 0 && state.filters.packTypes.size > 0) {
         dataToExport = displayFilteredData.filter(item => 
            (item.processType.includes('PICK') && state.filters.floors.has(item.floor)) ||
            (item.processType.includes('PACK') && state.filters.packTypes.has(item.packType))
        );
    } else if (state.filters.floors.size > 0) {
        dataToExport = displayFilteredData.filter(item => item.processType.includes('PICK') && state.filters.floors.has(item.floor));
    } else if (state.filters.packTypes.size > 0) {
        dataToExport = displayFilteredData.filter(item => item.processType.includes('PACK') && state.filters.packTypes.has(item.packType));
    }

    if (dataToExport.length === 0) {
        showModal('내보낼 데이터가 없습니다.', 'error');
        return;
    }

    const pickData = [];
    const packData = [];

    dataToExport.forEach(item => {
        const rowData = {
            '집품/포장': item.processType,
            '이름(원바코드)': item.employee.replace(/[👑]\s*/g, ''),
            '계약직 여부': item.isPerm ? 'PERM' : 'TEMP',
            '작업량': Number(item.unitQty),
            '로케이션 및 작업대': item.location || '-',
            'PP': item.processPathName || '-',
            '팩 종류': item.packType,
            'M/H': parseFloat(item.mh),
            'HTP': parseFloat(item.htp.replace('🚨 ', ''))
        };
        if (rowData['집품/포장'].includes('PICK')) {
            pickData.push(rowData);
        } else {
            packData.push(rowData);
        }
    });

    pickData.sort((a, b) => a.HTP - b.HTP);
    packData.sort((a, b) => a.HTP - b.HTP);

    const wb = XLSX.utils.book_new();

    const createStyledSheet = (data, sheetName) => {
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });

        const headerStyle = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
        };
        const cellStyle = {
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
        };

        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const headerAddr = XLSX.utils.encode_cell({ c: C, r: 0 });
            if (ws[headerAddr]) ws[headerAddr].s = headerStyle;

            for (let R = 1; R <= range.e.r; ++R) {
                const cellAddr = XLSX.utils.encode_cell({ c: C, r: R });
                if (ws[cellAddr]) {
                    if (!ws[cellAddr].s) ws[cellAddr].s = {};
                    Object.assign(ws[cellAddr].s, cellStyle);
                    if (typeof ws[cellAddr].v === 'number') {
                        if (typeof ws[cellAddr].v === 'number') {
                        if (headers[C] === 'M/H') ws[cellAddr].z = '0.0000';
                        else if (headers[C] === 'HTP') ws[cellAddr].z = '0.0';
                        else if (headers[C] === '작업량') ws[cellAddr].z = '0';
                    }
                }
            }
        }

        const colWidths = headers.map((header, i) => {
            const maxLength = Math.max(
                header.length,
                ...data.map(row => (row[header] ? row[header].toString().length : 0))
            );
            return { wch: maxLength + 2 };
        });
        ws['!cols'] = colWidths;
        ws['!autofilter'] = { ref: ws['!ref'] };
        ws['!freeze'] = { ySplit: 1 };

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    createStyledSheet(pickData, "PICK(집품)");
    createStyledSheet(packData, "PACK(포장)");

    if (wb.SheetNames.length > 0) {
        XLSX.writeFile(wb, "HTP_Data_Export_Styled.xlsx");
    } else {
        showModal('내보낼 데이터가 없습니다.', 'error');
    }
}

function updateStatus(status, message) {
    const dot = ui.statusIndicator.querySelector('.status-dot');
    const text = ui.statusIndicator.querySelector('span');
    dot.className = 'status-dot';
    if (status === 'connected') dot.classList.add('status-connected');
    else if (status === 'disconnected') dot.classList.add('status-disconnected');
    else if (status === 'loading') dot.classList.add('status-loading');
    text.textContent = message;
}

function showLoader() { 
    ui.loaderContainer.classList.remove('hidden'); 
    ui.tableView.classList.add('hidden'); 
}

function hideLoader() { 
    ui.loaderContainer.classList.add('hidden'); 
    ui.tableView.classList.remove('hidden'); 
}

function showModal(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"></div>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// --- Dashboard Functions ---
function updateDashboard(filteredAggregatedData, timeFilteredRawData) {
    updateKpiCards(filteredAggregatedData);
    updatePerformersLists(filteredAggregatedData);
    updateFloorHtpChart(filteredAggregatedData);
    updatePackTypeChart(filteredAggregatedData);
    updateProcessComparisonChart(filteredAggregatedData);
    updateHourlyTrendChart(timeFilteredRawData);
}

function generateColors(numColors) {
    const colors = [
        'rgba(102, 126, 234, 0.7)', 'rgba(245, 87, 108, 0.7)', 'rgba(34, 197, 94, 0.7)',
        'rgba(245, 158, 11, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)',
        'rgba(16, 185, 129, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(99, 102, 241, 0.7)'
    ];
    const result = [];
    for (let i = 0; i < numColors; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}

function updateKpiCards(data) {
    const totalWorkers = new Set(data.map(d => d.employee)).size;
    const totalQty = data.reduce((sum, d) => sum + d.unitQty, 0);
    const totalMh = data.reduce((sum, d) => sum + parseFloat(d.mh), 0);
    const avgHtp = totalMh > 0 ? (totalQty / totalMh) : 0;
    const lowPerformers = data.filter(d => parseFloat(d.htp) < getTargetHtp(d)).length;

    ui.kpi.totalWorkers.textContent = totalWorkers.toLocaleString();
    ui.kpi.totalQty.textContent = totalQty.toLocaleString();
    ui.kpi.avgHtp.textContent = avgHtp.toFixed(1);
    ui.kpi.lowPerformers.textContent = lowPerformers.toLocaleString();
}

function updatePerformersLists(data) {
    ui.topPickPerformersList.innerHTML = '';
    ui.topPackPerformersList.innerHTML = '';

    if (data.length === 0) {
        ui.topPickPerformersList.innerHTML = '<li class="text-gray-500">데이터 없음</li>';
        ui.topPackPerformersList.innerHTML = '<li class="text-gray-500">데이터 없음</li>';
        return;
    }

    const pickData = data.filter(d => d.processType.includes('PICK'));
    const packData = data.filter(d => d.processType.includes('PACK'));

    pickData.sort((a, b) => parseFloat(b.htp) - parseFloat(a.htp));
    packData.sort((a, b) => parseFloat(b.htp) - parseFloat(a.htp));

    const top5Pick = pickData.slice(0, 5);
    const top5Pack = packData.slice(0, 5);

    const createListItem = (item) => {
        return `<li style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 8px;">
                    <span>${item.employee.split('(')[0].trim()}</span>
                    <span style="font-weight: bold; color: #34d399;">${item.htp}</span>
                </li>`;
    };

    if (top5Pick.length > 0) {
        top5Pick.forEach(item => ui.topPickPerformersList.innerHTML += createListItem(item));
    } else {
        ui.topPickPerformersList.innerHTML = '<li class="text-gray-500">데이터 없음</li>';
    }

    if (top5Pack.length > 0) {
        top5Pack.forEach(item => ui.topPackPerformersList.innerHTML += createListItem(item));
    } else {
        ui.topPackPerformersList.innerHTML = '<li class="text-gray-500">데이터 없음</li>';
    }
}

function updateFloorHtpChart(data) {
    const pickData = data.filter(d => d.processType.includes('PICK'));
    const floorData = new Map();

    pickData.forEach(item => {
        if (!floorData.has(item.floor)) {
            floorData.set(item.floor, { totalQty: 0, totalMh: 0 });
        }
        const floor = floorData.get(item.floor);
        floor.totalQty += item.unitQty;
        floor.totalMh += parseFloat(item.mh);
    });

    const sortedFloors = Array.from(floorData.keys()).sort();
    const labels = sortedFloors;
    const avgHtps = sortedFloors.map(floor => {
         const d = floorData.get(floor);
         const weightedAvgHtp = d.totalMh > 0 ? (d.totalQty / d.totalMh) : 0;
         return weightedAvgHtp.toFixed(1);
    });

    const ctx = document.getElementById('floor-htp-chart').getContext('2d');
    if (state.charts.floorHtp) {
        state.charts.floorHtp.destroy();
    }
    state.charts.floorHtp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '평균 HTP',
                data: avgHtps,
                backgroundColor: generateColors(labels.length),
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#d1d5db' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#d1d5db' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: '#FFFFFF',
                    font: { weight: 'bold' },
                    formatter: (value) => value > 0 ? value : ''
                }
            }
        }
    });
}

function updatePackTypeChart(data) {
    const packData = data.filter(d => d.processType.includes('PACK'));
    let packTypeData = new Map();
    let totalQuantity = 0;

    packData.forEach(item => {
        if (!packTypeData.has(item.packType)) {
            packTypeData.set(item.packType, 0);
        }
        const currentQty = packTypeData.get(item.packType);
        packTypeData.set(item.packType, currentQty + item.unitQty);
        totalQuantity += item.unitQty;
    });
    
    const otherThreshold = 0.02;
    let otherQuantity = 0;
    const finalPackData = new Map();
    
    packTypeData.forEach((qty, type) => {
        if (totalQuantity > 0 && (qty / totalQuantity) < otherThreshold) {
            otherQuantity += qty;
        } else {
            finalPackData.set(type, qty);
        }
    });

    if (otherQuantity > 0) {
        finalPackData.set('기타', (finalPackData.get('기타') || 0) + otherQuantity);
    }

    const labels = Array.from(finalPackData.keys());
    const quantities = Array.from(finalPackData.values());

    const ctx = document.getElementById('pack-type-chart').getContext('2d');
    if (state.charts.packType) {
        state.charts.packType.destroy();
    }
    state.charts.packType = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: '작업량',
                data: quantities,
                backgroundColor: generateColors(labels.length),
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#d1d5db' } },
                datalabels: {
                    color: '#FFFFFF',
                    textAlign: 'center',
                    font: { weight: 'bold' },
                    formatter: (value, context) => {
                        const percentage = totalQuantity > 0 ? (value / totalQuantity * 100).toFixed(1) : 0;
                        const label = context.chart.data.labels[context.dataIndex];
                        if (parseFloat(percentage) < 5) return '';
                        return `${label}\n${percentage}%`;
                    }
                }
            }
        }
    });
}

function updateProcessComparisonChart(data) {
    const processStats = {
        PICK: { totalQty: 0, totalMh: 0 },
        PACK: { totalQty: 0, totalMh: 0 },
    };

    data.forEach(item => {
        const type = item.processType.includes('PICK') ? 'PICK' : 'PACK';
        processStats[type].totalQty += item.unitQty;
        processStats[type].totalMh += parseFloat(item.mh);
    });

    const pickHtp = processStats.PICK.totalMh > 0 ? (processStats.PICK.totalQty / processStats.PICK.totalMh) : 0;
    const packHtp = processStats.PACK.totalMh > 0 ? (processStats.PACK.totalQty / processStats.PACK.totalMh) : 0;

    const ctx = document.getElementById('process-comparison-chart').getContext('2d');
    if (state.charts.processComparison) {
        state.charts.processComparison.destroy();
    }
    state.charts.processComparison = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['PICK(집품)', 'PACK(포장)'],
            datasets: [{
                label: '총 작업량',
                data: [processStats.PICK.totalQty, processStats.PACK.totalQty],
                backgroundColor: ['rgba(102, 126, 234, 0.7)', 'rgba(245, 158, 11, 0.7)'],
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#d1d5db' } },
                datalabels: {
                     color: '#fff',
                     font: { weight: 'bold' },
                     formatter: (value, context) => {
                        const label = context.chart.data.labels[context.dataIndex];
                        const htp = label.includes('PICK') ? pickHtp : packHtp;
                        return `${value.toLocaleString()}\n(Avg ${htp.toFixed(0)} HTP)`;
                     }
                }
            }
        }
    });
}

function updateHourlyTrendChart(rawData) {
     const hourlyData = new Map();
     for(let i=0; i<24; i++) {
        hourlyData.set(i, { unitQty: 0, totalSeconds: 0 });
     }

     rawData.forEach(item => {
        const hour = item.htpStart.getUTCHours();
        const stats = hourlyData.get(hour);
        if(stats){
            stats.unitQty += item.unitQty;
            stats.totalSeconds += (item.htpEnd - item.htpStart) / 1000;
        }
     });

    const sortedHours = Array.from(hourlyData.keys()).sort((a, b) => a - b);
    const labels = sortedHours.map(hour => `${hour.toString().padStart(2, '0')}:00`);
    const htpValues = sortedHours.map(hour => {
        const stats = hourlyData.get(hour);
        if (!stats || stats.totalSeconds <= 0) return 0;
        const mh = stats.totalSeconds / 3600;
        return (stats.unitQty / mh).toFixed(1);
    });

    const ctx = document.getElementById('hourly-htp-chart').getContext('2d');
    if (state.charts.hourlyHtp) {
        state.charts.hourlyHtp.destroy();
    }
    state.charts.hourlyHtp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '시간별 평균 HTP',
                data: htpValues,
                fill: true,
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                borderColor: 'rgba(102, 126, 234, 1)',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, ticks: { color: '#d1d5db' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#d1d5db', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: {
                legend: { display: false },
                datalabels: { display: false }
            }
        }
    });
}

function showIndividualTrend(employeeName, processType) {
    const targetProcessTask = processType.includes('PICK') ? 'PICK(PICKING)' : 'PACK(PACKING)';
    const employeeData = globalRawData.filter(d => d.employee === employeeName && d.processTask === targetProcessTask);
    
    if (employeeData.length === 0) {
        showModal(`${employeeName.split('(')[0]} 님의 해당 공정 데이터가 없습니다.`, 'error');
        return;
    }

    const hourlyData = new Map();
    employeeData.forEach(item => {
        const hour = item.htpStart.getUTCHours();
        if (!hourlyData.has(hour)) {
            hourlyData.set(hour, { unitQty: 0, totalSeconds: 0 });
        }
        const hourStats = hourlyData.get(hour);
        hourStats.unitQty += item.unitQty;
        hourStats.totalSeconds += (item.htpEnd - item.htpStart) / 1000;
    });

    const sortedHours = Array.from(hourlyData.keys()).sort((a, b) => a - b);
    
    const labels = sortedHours.map(hour => `${hour}시`);
    const htpValues = sortedHours.map(hour => {
        const stats = hourlyData.get(hour);
        const mh = stats.totalSeconds / 3600;
        return mh > 0 ? (stats.unitQty / mh).toFixed(1) : 0;
    });

    ui.chartModalTitle.textContent = `${employeeName} 님의 시간대별 HTP (${processType.split('(')[0]})`;
    const ctx = document.getElementById('individual-htp-chart').getContext('2d');
    if (state.charts.individualHtp) {
        state.charts.individualHtp.destroy();
    }
    state.charts.individualHtp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '시간별 HTP',
                data: htpValues,
                fill: false,
                borderColor: 'rgba(102, 126, 234, 1)',
                tension: 0.1,
                pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#d1d5db' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#d1d5db' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: { 
                legend: { labels: { color: '#d1d5db' } },
                datalabels: {
                    align: 'top',
                    color: '#FFFFFF'
                }
            }
        }
    });

    ui.chartModalBackdrop.classList.add('active');
}

// Initialize on page load
initializeFiltersFromData([]);