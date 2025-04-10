// --- START OF FILE script.js ---

let roastingChart = null;
const profileColors = [
    '#2563eb', // 파랑
    '#dc2626', // 빨강
    '#16a34a', // 초록
    '#9333ea', // 보라
    '#ea580c'  // 주황
];
let maxTimeSecondsOverall = 0;
// --- Store original styles for hover reset ---
const originalDatasetStyles = {}; 

// --- Helper Functions ---
// (timeToSeconds, secondsToTime, generateTimeLabels, sortFiles, fadeColor functions remain the same)
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':'); if (parts.length < 2) return 0; // Allow mm:ss or mm:ss.f
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]); // Use parseFloat for seconds (e.g., 30.5)
    if (isNaN(minutes) || isNaN(seconds)) return 0; 
    return minutes * 60 + seconds;
}

function secondsToTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60); // Round for display
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function generateTimeLabels(maxSeconds) {
    const labels = []; if (maxSeconds < 0) return labels;
    for (let s = 0; s <= Math.ceil(maxSeconds); s++) { 
        labels.push(secondsToTime(s));
    }
    return labels;
}

function sortFiles(files) { // Enhanced sorting
    return Array.from(files).sort((a, b) => {
        const dateRegex = /(\d{4})[-]?(\d{2})[-]?(\d{2})/;
        const dA = a.name.match(dateRegex);
        const dB = b.name.match(dateRegex);
        if (dA && dB) {
            const dateA = new Date(parseInt(dA[1]), parseInt(dA[2]) - 1, parseInt(dA[3]));
            const dateB = new Date(parseInt(dB[1]), parseInt(dB[2]) - 1, parseInt(dB[3]));
            if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
        }
        const numRegex = /(\d+)/g;
        const nA = a.name.match(numRegex);
        const nB = b.name.match(numRegex);
        if (nA && nB) {
            for (let i = 0; i < Math.min(nA.length, nB.length); i++) {
                const numA = parseInt(nA[i]); const numB = parseInt(nB[i]);
                if (numA !== numB) return numA - numB;
            }
            if (nA.length !== nB.length) return nA.length - nB.length;
        }
        return a.name.localeCompare(b.name);
    });
}

function fadeColor(color, opacity) {
    if (!color) return 'rgba(128, 128, 128, 0.1)'; 
    if (color.startsWith('#')) {
        const bigint = parseInt(color.slice(1), 16);
        const r = (bigint >> 16) & 255; const g = (bigint >> 8) & 255; const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else if (color.startsWith('rgba')) {
        return color.replace(/[\d\.]+\)$/g, `${opacity})`);
    } else if (color.startsWith('rgb')) {
         return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
    }
    return color; 
}

// --- Chart Initialization and Configuration ---
// (initChart function remains the same)
function initChart() {
    const ctx = document.getElementById('roastingChart').getContext('2d');
    if (roastingChart) { roastingChart.destroy(); }
    roastingChart = new Chart(ctx, {
        type: 'line', 
        data: { labels: [], datasets: [] },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 30, left: 10, right: 10 } }, 
            interaction: { mode: 'index', intersect: false, axis: 'x' },
            scales: {
                x: { 
                    type: 'category', title: { display: true, text: '시간' }, 
                    ticks: { autoSkip: true, maxTicksLimit: 15, maxRotation: 0, 
                         callback: function(value, index) { 
                             const label = this.getLabels()[index]; if (!label) return null;
                             const totalSeconds = timeToSeconds(label);
                             if (totalSeconds === 0 || (totalSeconds > 0 && totalSeconds % 30 === 0)) return label;
                             return null; 
                         } 
                    } 
                },
                temp: { type: 'linear', position: 'left', title: { display: true, text: '온도 (°C)' }, min: 50, suggestedMax: 250 },
                ror: { type: 'linear', position: 'right', title: { display: true, text: 'ROR (°C/min)' }, min: 0, suggestedMax: 25, grid: { drawOnChartArea: false } }
            },
            plugins: {
                annotation: { clip: false, annotations: {} }, 
                legend: { 
                    display: true, position: 'top', 
                    labels: { padding: 10, boxWidth: 15, 
                        filter: function(item, chartData) {
                            const dataset = chartData.datasets[item.datasetIndex];
                            return dataset.label && dataset.label.includes('온도'); 
                        },
                    },
                    onHover: handleLegendHover, onLeave: handleLegendLeave
                },
                tooltip: { 
                    callbacks: { 
                        title: (tooltipItems) => tooltipItems.length > 0 ? `시간: ${tooltipItems[0].label}` : '',
                        label: (context) => { 
                             let label = context.dataset.fileIdentifier ? `[${context.dataset.fileIdentifier}] ` : ''; 
                             let valueLabel = '';
                             if (context.parsed.y !== null && !isNaN(context.parsed.y)) { 
                                valueLabel = context.dataset.yAxisID === 'temp' ? `온도: ${context.parsed.y.toFixed(1)} °C` : `ROR: ${context.parsed.y.toFixed(1)} °C/min`;
                             } else { valueLabel = context.dataset.yAxisID === 'temp' ? '온도: -' : 'ROR: -'; }
                             return label + valueLabel; 
                         } 
                    } 
                }
            }
        }
    });
}

// --- UI Element Creation (Checkboxes) ---
// (createCheckbox function remains the same)
function createCheckbox(file, fileIdentifier, color) { 
    const container = document.getElementById('checkbox-container'); 
    const checkboxDiv = document.createElement('div'); 
    checkboxDiv.className = 'file-checkbox'; 

    const checkbox = document.createElement('input'); 
    checkbox.type = 'checkbox'; 
    checkbox.id = `cb-${fileIdentifier.replace(/[^a-zA-Z0-9]/g, '-')}`; 
    checkbox.value = fileIdentifier; 
    checkbox.checked = true; 
    checkbox.style.marginRight = '8px'; 

    const label = document.createElement('label'); 
    label.htmlFor = checkbox.id; 
    label.className = 'flex items-center cursor-pointer'; 

    const colorBox = document.createElement('span'); 
    colorBox.className = 'color-indicator'; 
    colorBox.style.backgroundColor = color; 
    colorBox.style.border = '1px solid #ccc'; 

    const labelText = document.createElement('span'); 
    labelText.textContent = file.name; 
    labelText.style.fontSize = '14px'; 

    label.appendChild(colorBox); 
    label.appendChild(labelText); 
    checkboxDiv.appendChild(checkbox); 
    checkboxDiv.appendChild(label); 
    container.appendChild(checkboxDiv);
    
    checkbox.addEventListener('change', function() { 
        const targetFileId = this.value; 
        const isChecked = this.checked; 
        let datasetsUpdated = false;
        roastingChart.data.datasets.forEach((dataset, idx) => { 
            if (dataset.fileIdentifier === targetFileId) { 
                roastingChart.setDatasetVisibility(idx, isChecked); datasetsUpdated = true;
            } 
        }); 
        const annotations = roastingChart.options.plugins.annotation.annotations; 
        Object.keys(annotations).forEach(key => { 
            if (key.includes(`-file-${targetFileId}`)) { 
                 annotations[key].display = isChecked; datasetsUpdated = true;
             }
        }); 
        if(datasetsUpdated) { roastingChart.update(); }
    });
}

// --- Key Point Detection and Annotation ---
// (findKeyPoints, findLabelIndex, calculateLabelOffset, addKeyPointAnnotation functions remain the same)
function findKeyPoints(times, temps, rors) { 
     let keyPoints = { tp: null, y: null, first: null, out: null }; 
     const tempY = 160, temp1C = 204; let minRorIdx = -1, minRorVal = Infinity;
     const searchEndIndexTP = Math.min(temps.length, timeToSeconds("01:30") + 5); // Check slightly beyond 1:30
     for (let i = 1; i < searchEndIndexTP; i++) {
         if (temps[i] !== null && temps[i] > 70 && rors[i] !== null && rors[i] < minRorVal) { 
             minRorVal = rors[i]; minRorIdx = i; 
         }
     }
      // Ensure index is valid before accessing data
     if (minRorIdx > 0 && minRorIdx < times.length && temps[minRorIdx] !== undefined && times[minRorIdx] !== undefined) { 
          keyPoints.tp = { time: times[minRorIdx], temp: temps[minRorIdx], ror: rors[minRorIdx] }; 
     }
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= tempY && temps[i+1] > tempY && times[i+1] !== undefined) { 
             keyPoints.y = { time: times[i+1], temp: temps[i+1] }; break; 
         }
     }
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= temp1C && temps[i+1] > temp1C && times[i+1] !== undefined) { 
             keyPoints.first = { time: times[i+1], temp: temps[i+1] }; break; 
         }
     }
     const lastIdx = temps.length - 1; 
     if (lastIdx >= 0 && temps[lastIdx] !== null && times[lastIdx] !== undefined) { 
         keyPoints.out = { time: times[lastIdx], temp: temps[lastIdx], ror: rors[lastIdx] }; 
     } 
     return keyPoints;
}

function findLabelIndex(timeStr) {
    if (!roastingChart || !roastingChart.data.labels) return -1;
    let exactIndex = roastingChart.data.labels.indexOf(timeStr);
    if (exactIndex !== -1) return exactIndex;
    const targetSeconds = timeToSeconds(timeStr);
    let closestIndex = -1; let minDiff = Infinity;
    roastingChart.data.labels.forEach((label, index) => {
        const labelSeconds = timeToSeconds(label);
        const diff = Math.abs(labelSeconds - targetSeconds);
        if (diff < minDiff && diff < 0.51) { // Allow ~0.5 sec diff due to rounding
             minDiff = diff; closestIndex = index;
        }
    });
    return closestIndex; 
}

function calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex) {
    const pointLabelIndex = findLabelIndex(point.time); const pointTemp = point.temp;
    if (pointLabelIndex < 0) return { xAdjust: 0, yAdjust: (fileIndex % 2 === 0 ? -30 : 30) };
    let baseVerticalDirection = (type === 'tp' || type === 'y') ? -1 : 1; 
    let finalVerticalDirection = (fileIndex % 2 === 0) ? baseVerticalDirection : -baseVerticalDirection;
    const baseVerticalOffset = 25; const fileVerticalSpacing = 18; 
    let yAdjust = finalVerticalDirection * (baseVerticalOffset + Math.floor(fileIndex / 2) * fileVerticalSpacing);
    const maxPixelOffsetVertical = chartArea ? chartArea.height * 0.25 : 100; 
    if (Math.abs(yAdjust) > maxPixelOffsetVertical) yAdjust = Math.sign(yAdjust) * maxPixelOffsetVertical;
    if (pointTemp < 80 && yAdjust > 0) yAdjust = -baseVerticalOffset - (fileIndex % 3) * fileVerticalSpacing; 
     else if (pointTemp > 230 && yAdjust < 0) yAdjust = baseVerticalOffset + (fileIndex % 3) * fileVerticalSpacing; 
    const xPixel = chartArea ? roastingChart.scales.x.getPixelForTick(pointLabelIndex) : 0;
    const horizontalPositionRatio = chartArea ? (xPixel - chartArea.left) / chartArea.width : (pointLabelIndex / (roastingChart.data.labels.length || 1));
    const baseHorizontalOffset = 10; const fileHorizontalSpacing = 15; let xAdjust;
    const xOffsetGroup = Math.floor(fileIndex / 2); const xDirection = (fileIndex % 2 === 0) ? 1 : -1; 
    if (horizontalPositionRatio < 0.15) xAdjust = baseHorizontalOffset + xOffsetGroup * fileHorizontalSpacing; 
    else if (horizontalPositionRatio > 0.85) xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing; 
    else xAdjust = xDirection * (baseHorizontalOffset + 20 + xOffsetGroup * fileHorizontalSpacing);
    if (chartArea && xPixel + xAdjust < chartArea.left + 5) xAdjust = (chartArea.left + 5) - xPixel;
     if (chartArea && horizontalPositionRatio > 0.8 && xAdjust > 0) xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing;
    return { xAdjust, yAdjust };
}

function addKeyPointAnnotation(type, point, fileIndex, totalFiles, color, fileIdentifier) {
    if (!point || point.time === undefined || point.temp === undefined) return; 
    const chartArea = roastingChart.chartArea; 
    const pointLabelIndex = findLabelIndex(point.time);
    if (pointLabelIndex < 0) return; 
    const { xAdjust, yAdjust } = calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex);
    const annotationPrefix = `${type}-file-${fileIdentifier}`; 
    const labelAnnotation = {
        type: 'label', xValue: point.time, yValue: point.temp, xScaleID: 'x', yScaleID: 'temp',
        yAdjust: yAdjust, xAdjust: xAdjust, content: [`${type.toUpperCase()}: ${point.time}`, `${point.temp.toFixed(1)}°C`],
        backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: color, borderWidth: 1, borderRadius: 4, 
        padding: 4, textAlign: 'left', font: { size: 10 }, display: true 
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-label`] = labelAnnotation;
    const pointAnnotation = {
        type: 'point', xValue: point.time, yValue: point.temp, xScaleID: 'x', yScaleID: 'temp',
        backgroundColor: color, borderColor: 'white', borderWidth: 1, radius: 4, display: true 
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-point`] = pointAnnotation;
     const lineAnnotation = {
         type: 'line', xMin: point.time, xMax: point.time, xScaleID: 'x', yScaleID: 'temp',
         yMin: point.temp + Math.min(0, yAdjust) + (yAdjust < 0 ? 5 : 0), 
         yMax: point.temp + Math.max(0, yAdjust) + (yAdjust > 0 ? -5 : 0),
         borderColor: color, borderWidth: 1, borderDash: [2, 2], display: true 
     };
     if (Math.abs(yAdjust) > 10) roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`] = lineAnnotation;
     else delete roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`];
}


// --- Excel File Processing ---
function processExcelFile(file, index, fileData) { 
    try { 
        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true }); 
        const sheetName = workbook.SheetNames[0]; 
        const ws = workbook.Sheets[sheetName]; 
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: false, dateNF:'m:ss'}); 
        
        const fileTimes = [], temps = [], rors = []; 
        let maxSec = 0;
        let headerRow = jsonData[0] || []; 

        // --- *** 열 인덱스 결정 (수정됨) *** ---
        let timeCol = -1, tempCol = -1;
        // ROR 열은 무조건 F(5) 사용, 시간/온도만 동적 탐색 시도
        const rorCol = 5; // <<< ROR 열 인덱스 강제 지정 (F열)

        const timeKeywords = ['time', '시간'];
        const tempKeywords = ['bt', 'bean temp', '원두 온도', '원두표면', 'temp', '온도']; 
             
        headerRow.forEach((header, colIndex) => {
           const lowerHeader = String(header || '').toLowerCase().trim(); 
           if (timeCol === -1 && timeKeywords.some(k => lowerHeader.includes(k))) timeCol = colIndex;
           if (tempCol === -1 && tempKeywords.some(k => lowerHeader.includes(k))) tempCol = colIndex;
        });

        // 시간/온도 탐색 실패 시 기본값 사용
        if (timeCol === -1) timeCol = 0;  // 시간: A열 (인덱스 0) - 기본값
        if (tempCol === -1) tempCol = 2;  // 온도: C열 (인덱스 2) - 사용자 지정 기본값

        // 최종 사용할 열 인덱스 로그 출력
        console.log(`파일: ${file.name} - 사용할 열: 시간(${timeCol}), 원두온도(${tempCol}), 원두ROR(${rorCol})`); 

        // 데이터 처리 루프 (인덱스 사용)
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row) continue; 

            // --- *** 지정된 열에서 데이터 읽기 *** ---
            const timeVal = row[timeCol];
            const tempVal = row[tempCol]; // C열(2) 또는 동적으로 찾은 열
            const rorVal = row[rorCol];   // F열(5) 고정

            // --- 시간 파싱 및 유효성 검사 ---
            let tStr = null;
            if (typeof timeVal === 'string' && timeVal.includes(':')) {
                const parts = timeVal.split(':');
                if(parts.length === 2 && !isNaN(parseInt(parts[0], 10)) && !isNaN(parseFloat(parts[1]))) {
                     const m = String(parseInt(parts[0], 10)).padStart(2, '0');
                     const sFloat = parseFloat(parts[1]);
                     const s = String(Math.round(sFloat)).padStart(2, '0'); 
                     tStr = `${m}:${s}`;
                 } 
            } else if (typeof timeVal === 'number' && timeVal < 2) { 
                 const totalSecondsRaw = timeVal * 86400; 
                 tStr = secondsToTime(totalSecondsRaw); 
            } else if (timeVal instanceof Date) {
                 tStr = `${String(timeVal.getMinutes()).padStart(2, '0')}:${String(timeVal.getSeconds()).padStart(2, '0')}`;
            } else { continue; }

            // --- 온도/ROR 파싱 및 유효성 검사 ---
            const tempV = Number(tempVal);
            if (isNaN(tempV)) continue; // 온도 유효하지 않으면 스킵
            const rorV = (rorVal !== undefined && rorVal !== null && !isNaN(Number(rorVal))) ? Number(rorVal) : null;

            // --- 데이터 배열에 추가 ---
            if (tStr) { 
                const currentSeconds = timeToSeconds(tStr); 
                if (fileTimes.length === 0 || currentSeconds > timeToSeconds(fileTimes[fileTimes.length - 1]) || (currentSeconds === timeToSeconds(fileTimes[fileTimes.length - 1]) && temps[temps.length-1] !== tempV) ) {
                     fileTimes.push(tStr); temps.push(tempV); rors.push(rorV); 
                     if (currentSeconds > maxSec) maxSec = currentSeconds; 
                 } else if (currentSeconds === timeToSeconds(fileTimes[fileTimes.length - 1])) {
                      temps[temps.length - 1] = tempV; rors[rors.length - 1] = rorV;
                 } 
            }
        } 
        
        if (temps.length === 0) {
            console.warn(`파일 ${file.name} 에서 유효한 데이터를 추출하지 못했습니다.`); return null;
        } 

        // --- (이하 로직 동일: 키포인트 찾기, 데이터셋 생성, 스타일 저장 등) ---
        const keyPts = findKeyPoints(fileTimes, temps, rors); 
        const clr = profileColors[index % profileColors.length]; 
        const fileIdentifier = file.name; 
        const globalLabels = roastingChart.data.labels;
        const fullTemps = new Array(globalLabels.length).fill(null);
        const fullRors = new Array(globalLabels.length).fill(null);
        fileTimes.forEach((t, dataIndex) => {
            const labelIndex = findLabelIndex(t); 
            if (labelIndex !== -1 && fullTemps[labelIndex] === null) { // Only fill if null
                 fullTemps[labelIndex] = temps[dataIndex]; fullRors[labelIndex] = rors[dataIndex];
            }
        });
        const tempDs = { 
            label: `온도 (${file.name})`, fileIdentifier: fileIdentifier, yAxisID: 'temp', data: fullTemps, 
            borderColor: clr, backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, hidden: false, spanGaps: true 
        }; 
        const rorDs = { 
            label: `ROR (${file.name})`, fileIdentifier: fileIdentifier, yAxisID: 'ror', data: fullRors, 
            borderColor: clr, backgroundColor: 'transparent', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, hidden: false, spanGaps: true 
        }; 
        originalDatasetStyles[tempDs.label] = { borderWidth: tempDs.borderWidth, borderColor: tempDs.borderColor };
        originalDatasetStyles[rorDs.label] = { borderWidth: rorDs.borderWidth, borderColor: rorDs.borderColor };
        return { 
            fileName: file.name, fileIdentifier: fileIdentifier, tempDataset: tempDs, rorDataset: rorDs, 
            keyPoints: keyPts, color: clr, maxSeconds: maxSec 
        };
    } catch (err) { 
        console.error(`파일 처리 오류 ${file.name}:`, err); 
        alert(`파일 읽기/처리 오류: ${file.name}\n${err.message}\n콘솔에서 상세 내용을 확인하세요.`); 
        return null; 
    }
} // --- END of processExcelFile ---


// --- Legend Hover Handlers ---
// (handleLegendHover, handleLegendLeave functions remain the same)
function handleLegendHover(evt, item, legend) {
    if (!roastingChart || !item) return;
    const hoveredIndex = item.datasetIndex;
    const hoveredDataset = legend.chart.data.datasets[hoveredIndex];
    if (!hoveredDataset || !hoveredDataset.fileIdentifier) return; 
    const fileId = hoveredDataset.fileIdentifier;
    const hoverHighlightWidth = 3; 
    legend.chart.data.datasets.forEach((dataset, index) => {
        const meta = legend.chart.getDatasetMeta(index);
        if (meta.hidden) return; 
        if (!originalDatasetStyles[dataset.label]) {
             originalDatasetStyles[dataset.label] = { borderWidth: dataset.borderWidth, borderColor: dataset.borderColor };
        }
        if (dataset.fileIdentifier === fileId) {
            dataset.borderWidth = hoverHighlightWidth;
            dataset.borderColor = originalDatasetStyles[dataset.label].borderColor; 
        } else {
            dataset.borderColor = fadeColor(originalDatasetStyles[dataset.label].borderColor, 0.2); 
            dataset.borderWidth = originalDatasetStyles[dataset.label].borderWidth; 
        }
    });
    legend.chart.update('none'); 
}
function handleLegendLeave(evt, item, legend) {
     if (!roastingChart || !item) return;
     legend.chart.data.datasets.forEach((dataset, index) => {
         const meta = legend.chart.getDatasetMeta(index);
         if (meta.hidden) return; 
         if (originalDatasetStyles[dataset.label]) {
             dataset.borderWidth = originalDatasetStyles[dataset.label].borderWidth;
             dataset.borderColor = originalDatasetStyles[dataset.label].borderColor;
         } else { /* Fallback if needed */ }
     });
     legend.chart.update('none'); 
}

// --- Main Application Logic ---
// (DOMContentLoaded event listener remains the same)
document.addEventListener('DOMContentLoaded', function() { 
    initChart(); 
    const fileInput = document.getElementById('fileInput'); 
    const checkboxContainer = document.getElementById('checkbox-container');
    fileInput.addEventListener('change', function(e) {
        const files = e.target.files; if (!files || files.length === 0) return;
        checkboxContainer.innerHTML = ''; 
        if (roastingChart) {
             roastingChart.data.labels = []; roastingChart.data.datasets = [];
             roastingChart.options.plugins.annotation.annotations = {};
             Object.keys(originalDatasetStyles).forEach(key => delete originalDatasetStyles[key]); 
        } else { initChart(); }
        maxTimeSecondsOverall = 0; 
        const sortedFiles = sortFiles(files);
        const fileReadPromises = sortedFiles.map(file => new Promise((resolve, reject) => { 
                const reader = new FileReader(); 
                reader.onload = (event) => resolve({ file: file, data: event.target.result }); 
                reader.onerror = (err) => reject({ file: file, error: err }); 
                reader.readAsArrayBuffer(file); 
            }));
        Promise.all(fileReadPromises).then(results => {
            const fileContents = []; 
            results.forEach(result => {
                 if (result.data) fileContents.push({ file: result.file, data: result.data, index: fileContents.length });
                 else if (result.error) { console.error(`파일 읽기 오류 ${result.file.name}:`, result.error); alert(`파일 읽기 오류: ${result.file.name}`); }
            });
            if (fileContents.length === 0) { alert("선택된 파일을 읽을 수 없습니다."); roastingChart.update(); return; }
            
            // Determine max time first
             fileContents.forEach(item => {
                 try {
                     const workbook = XLSX.read(item.data, { type: 'array', sheetStubs: true }); // sheetStubs might help performance slightly
                     const sheetName = workbook.SheetNames[0]; 
                     const ws = workbook.Sheets[sheetName]; 
                     const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: false, dateNF:'m:ss'}); 
                     let maxSec = 0;
                     let timeCol = 0; // Assume time in col 0 for max time check
                      for (let i = 1; i < jsonData.length; i++) {
                         const timeVal = jsonData[i]?.[timeCol];
                         if(typeof timeVal === 'string' && timeVal.includes(':')) maxSec = Math.max(maxSec, timeToSeconds(timeVal));
                         else if(typeof timeVal === 'number' && timeVal < 2) maxSec = Math.max(maxSec, timeVal * 86400);
                     }
                     if (maxSec > maxTimeSecondsOverall) maxTimeSecondsOverall = maxSec;
                 } catch (err) { console.error(`최대 시간 계산 오류 ${item.file.name}:`, err); }
             });

            const xAxisPaddingSeconds = 30; 
            const actualMaxSecs = maxTimeSecondsOverall + xAxisPaddingSeconds; 
            roastingChart.data.labels = generateTimeLabels(actualMaxSecs); 
            console.log(`X축 레이블 생성 완료: ${secondsToTime(actualMaxSecs)} 까지 (${roastingChart.data.labels.length}개)`);

            const finalValidResults = [];
            fileContents.forEach(item => {
                 const result = processExcelFile(item.file, item.index, item.data); 
                 if (result) finalValidResults.push(result);
            });

            if (finalValidResults.length === 0) { alert("유효한 로스팅 데이터를 찾을 수 없습니다."); roastingChart.update(); return; }

            const totalValidFiles = finalValidResults.length;
            finalValidResults.forEach((result, validIndex) => {
                roastingChart.data.datasets.push(result.tempDataset);
                roastingChart.data.datasets.push(result.rorDataset);
                createCheckbox(result, result.fileIdentifier, result.color); 
            });
            roastingChart.update(); 
            finalValidResults.forEach((result, validIndex) => {
                 const fileId = result.fileIdentifier; 
                if (result.keyPoints.tp) addKeyPointAnnotation('tp', result.keyPoints.tp, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.y) addKeyPointAnnotation('y', result.keyPoints.y, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.first) addKeyPointAnnotation('first', result.keyPoints.first, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.out) addKeyPointAnnotation('out', result.keyPoints.out, validIndex, totalValidFiles, result.color, fileId);
            });
            console.log("차트 업데이트 (주석 포함).");
            roastingChart.update(); 

        }).catch(errorInfo => { 
            console.error("파일 처리 중 오류 발생:", errorInfo); 
            alert(`파일 처리 중 오류:\n${errorInfo.file?.name || '알 수 없는 파일'}\n${errorInfo.error || '알 수 없는 오류'}`); 
            roastingChart.update();
        });
        fileInput.value = ''; 
    });
});
// --- END OF FILE script.js ---
