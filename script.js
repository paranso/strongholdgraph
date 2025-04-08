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

// --- Helper Functions ---
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':'); if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10), seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return 0; return minutes * 60 + seconds;
}
function secondsToTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60), seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function generateTimeLabels(maxSeconds) {
    const labels = []; if (maxSeconds < 0) return labels;
    for (let s = 0; s <= maxSeconds; s++) labels.push(secondsToTime(s)); return labels;
}
function sortFiles(files) {
    return Array.from(files).sort((a, b) => {
        const nA = a.name.match(/\d+/g), nB = b.name.match(/\d+/g); const dA = a.name.match(/\d{4}[-]?\d{2}[-]?\d{2}/), dB = b.name.match(/\d{4}[-]?\d{2}[-]?\d{2}/);
        if (dA && dB) return new Date(dA[0].replace(/-/g, '/')) - new Date(dB[0].replace(/-/g, '/')); if (nA && nB) return parseInt(nA[0]) - parseInt(nB[0]); return a.name.localeCompare(b.name);
    });
}

// --- Chart Initialization and Configuration ---
function initChart() { // (이전과 동일)
    const ctx = document.getElementById('roastingChart').getContext('2d');
    roastingChart = new Chart(ctx, {
        type: 'line', data: { labels: [], datasets: [] },
        options: {
            responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,
            layout: { padding: { top: 30, bottom: 30 } }, // 상하단 여백 추가 (라벨 공간 확보)
            interaction: { mode: 'index', intersect: false, axis: 'x' },
            scales: {
                x: { type: 'category', title: { display: true, text: '시간' }, ticks: { autoSkip: true, maxTicksLimit: 20, maxRotation: 0, callback: function(v, i) { const l = this.getLabels()[i]; if (l && timeToSeconds(l) % 30 === 0) return l; return null; } } },
                temp: { type: 'linear', position: 'left', title: { display: true, text: '온도 (°C)' }, min: 50, suggestedMax: 250 },
                ror: { type: 'linear', position: 'right', title: { display: true, text: 'ROR (°C/min)' }, min: 0, suggestedMax: 25, grid: { drawOnChartArea: false } }
            },
            plugins: {
                annotation: { clip: false, annotations: {} }, // clip: false 로 영역밖 일부 허용
                legend: { display: false },
                tooltip: { callbacks: { title: (i) => `시간: ${i[0].label}`, label: (c) => { let l = c.dataset.label || ''; l = l.includes('온도') ? '온도: ' : l.includes('ROR') ? 'ROR: ' : l + ': '; if (c.parsed.y !== null) l += `${c.parsed.y.toFixed(1)}${c.dataset.yAxisID === 'temp' ? ' °C' : ' °C/min'}`; return l; } } }
            }
        }
    });
}

// --- UI Element Creation (Checkboxes) ---
function createCheckbox(file, index, color) { // (이전과 동일)
    const container = document.getElementById('checkbox-container'); const checkboxDiv = document.createElement('div'); checkboxDiv.className = 'file-checkbox inline-flex items-center mr-4 mb-2 p-2 bg-white rounded shadow';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `file-${index}`; checkbox.checked = true; checkbox.className = 'form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out mr-2';
    const label = document.createElement('label'); label.htmlFor = `file-${index}`; label.className = 'flex items-center cursor-pointer';
    const colorBox = document.createElement('span'); colorBox.className = 'inline-block w-3 h-3 rounded-sm mr-2'; colorBox.style.backgroundColor = color;
    const labelText = document.createElement('span'); labelText.textContent = file.name; labelText.className = 'text-sm text-gray-700';
    label.appendChild(colorBox); label.appendChild(labelText); checkboxDiv.appendChild(checkbox); checkboxDiv.appendChild(label); container.appendChild(checkboxDiv);
    checkbox.addEventListener('change', function() { const isChecked = this.checked; roastingChart.data.datasets.forEach(d => { if (d.fileIdentifier === file.name) d.hidden = !isChecked; }); const ann = roastingChart.options.plugins.annotation.annotations; Object.keys(ann).forEach(k => { if (k.includes(`-file-${index}`)) ann[k].display = isChecked; }); roastingChart.update(); });
}

// --- Key Point Detection and Annotation ---
function findKeyPoints(times, temps, rors) { // (이전과 동일)
     let keyPoints = { tp: null, y: null, first: null, out: null }; const tempY = 160, temp1C = 204; let minRorIdx = -1, minRorVal = Infinity;
     for (let i = 1; i < Math.min(rors.length, 90); i++) if (rors[i] !== null && temps[i] > 70 && rors[i] < minRorVal) { minRorVal = rors[i]; minRorIdx = i; }
     if (minRorIdx > 0) keyPoints.tp = { time: times[minRorIdx], temp: temps[minRorIdx], ror: rors[minRorIdx], index: minRorIdx };
     for (let i = 0; i < temps.length - 1; i++) if (temps[i] <= tempY && temps[i+1] > tempY) { keyPoints.y = { time: times[i+1], temp: temps[i+1], index: i+1 }; break; }
     for (let i = 0; i < temps.length - 1; i++) if (temps[i] <= temp1C && temps[i+1] > temp1C) { keyPoints.first = { time: times[i+1], temp: temps[i+1], index: i+1 }; break; }
     const lastIdx = temps.length - 1; if (lastIdx >= 0) keyPoints.out = { time: times[lastIdx], temp: temps[lastIdx], ror: rors[lastIdx], index: lastIdx }; return keyPoints;
}

// --- **** 라벨 오프셋 계산 함수 수정 **** ---
function calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex) {
    const pointIndex = point.index;
    const pointTemp = point.temp;

    // 기본 수직 방향 결정 및 파일 인덱스 따른 교차
    let baseVerticalDirection = (type === 'tp' || type === 'y') ? -1 : 1; // TP/Y 위(-), FIRST/OUT 아래(+)
    let finalVerticalDirection = (fileIndex % 2 === 0) ? baseVerticalDirection : -baseVerticalDirection;

    // 수직 거리 계산
    const baseVerticalOffset = 30; // 기본 수직 거리 약간 줄임
    const fileVerticalSpacing = 15; // 파일간 추가 간격 약간 줄임
    let yAdjust = finalVerticalDirection * (baseVerticalOffset + Math.floor(fileIndex / 2) * fileVerticalSpacing);

    // --- **** 수직 오프셋 제한 (Clamping) **** ---
    const maxPixelOffsetVertical = 120; // 위/아래 최대 허용 픽셀 오프셋 (차트 높이에 따라 조절 필요)
    if (Math.abs(yAdjust) > maxPixelOffsetVertical) {
        yAdjust = Math.sign(yAdjust) * maxPixelOffsetVertical;
        // console.log(`[${fileIndex}] ${type} Clamped yAdjust: ${yAdjust}`);
    }

    // 온도가 너무 낮거나 높을 때 방향 강제 (Clamping 후에도 필요할 수 있음)
     if (pointTemp < 80 && yAdjust > 50) { // 너무 낮은데 아래로 많이 가면
         yAdjust = -baseVerticalOffset - (fileIndex % 2) * fileVerticalSpacing; // 위쪽으로 조정
     } else if (pointTemp > 225 && yAdjust < -50) { // 너무 높은데 위로 많이 가면
         yAdjust = baseVerticalOffset + (fileIndex % 2) * fileVerticalSpacing; // 아래쪽으로 조정
     }

    // --- 수평 오프셋 조정 ---
    const horizontalPositionRatio = pointIndex / (roastingChart.data.labels.length || 1);
    const baseHorizontalOffset = 5; // 기본 수평 거리
    const fileHorizontalSpacing = 10; // 파일별 수평 분산 간격
    let xAdjust;

    if (horizontalPositionRatio < 0.55) { // 차트 왼쪽
        xAdjust = baseHorizontalOffset + (fileIndex % 3) * fileHorizontalSpacing; // 오른쪽으로 분산
    } else { // 차트 오른쪽
        // 왼쪽으로 밀어내는 강도 조절 (덜 강하게)
        xAdjust = -(baseHorizontalOffset + 45 + (fileIndex % 3) * fileHorizontalSpacing);
    }

    // 시작/끝 부분 라벨이 Y축/경계 가리는 것 방지
    if (pointIndex < 15 && xAdjust < -10) xAdjust = -10;
    // 마지막 부분 라벨이 오른쪽 경계 넘는 것 방지 (chartArea 사용 - 옵션)
    // if (chartArea && point.xPixel + xAdjust > chartArea.right - 30) xAdjust = chartArea.right - point.xPixel - 30;

    return { xAdjust, yAdjust };
}

function addKeyPointAnnotation(type, point, fileIndex, totalFiles, color) {
    if (!point || point.index === undefined || point.index < 0) {
        // console.warn(`Invalid point data for ${type}, fileIndex ${fileIndex}:`, point);
        return; // 유효하지 않은 데이터면 주석 추가 안함
    }
    const annotationPrefix = `${type}-file-${fileIndex}`;
    const chartArea = roastingChart.chartArea; // 차트 영역 정보

    // ** calculateLabelOffset 호출 시 chartArea 전달 **
    const { xAdjust, yAdjust } = calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex);

    // --- **** Label Annotation 먼저 정의 (가시성 확인용) **** ---
    const labelAnnotation = {
        type: 'label', xValue: point.index, yValue: point.temp,
        yAdjust: yAdjust, xAdjust: xAdjust, // 계산된 픽셀 오프셋 적용
        yScaleID: 'temp',
        content: [`${type.toUpperCase()}: ${point.time}`, `${point.temp.toFixed(1)}°C`].filter(Boolean),
        backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: color,
        borderWidth: 1, borderRadius: 4, padding: 4, textAlign: 'left',
        font: { size: 10 },
        // ** 초기 display 는 true 로 설정 **
        display: true
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-label`] = labelAnnotation;


    // --- Point Annotation (항상 표시) ---
    const pointAnnotation = {
        type: 'point', xValue: point.index, yValue: point.temp, yScaleID: 'temp',
        backgroundColor: color, borderColor: 'white', borderWidth: 1, radius: 4, display: true
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-point`] = pointAnnotation;


    // --- **** Line Annotation: Label이 실제로 그려질 때만 그림 (근사치) **** ---
    // 라벨이 너무 멀리 가지 않도록 yAdjust가 제한되었으므로, 이제 항상 그려도 괜찮을 수 있음.
    // 또는, yAdjust가 clamp되었는지 여부 확인하여 결정 가능 (더 복잡)
    // 여기서는 yAdjust 값에 따라 선의 길이를 조정하여 연결
    const lineAnnotation = {
        type: 'line', xMin: point.index, xMax: point.index,
        // yAdjust 방향에 맞춰 선의 시작/끝점 계산
        yMin: point.temp + (yAdjust > 0 ? 5 : yAdjust), // 아래로 갈땐 점에서 시작, 위로 갈땐 라벨 Y값에서 시작
        yMax: point.temp + (yAdjust < 0 ? -5 : yAdjust), // 위로 갈땐 점에서 시작, 아래로 갈땐 라벨 Y값에서 시작
        yScaleID: 'temp', borderColor: color, borderWidth: 1, borderDash: [2, 2],
        // ** 라벨이 display: true 일 때만 선도 표시 **
        display: labelAnnotation.display
    };
     // 라벨과 점이 너무 가까우면 선 안그리기 (옵션)
     if (Math.abs(yAdjust) > 10) {
        roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`] = lineAnnotation;
     } else {
        // 선이 너무 짧으면 삭제
        delete roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`];
     }
}


// --- Excel File Processing ---
function processExcelFile(file, index, fileData) { // (이전과 동일)
    try { const workbook = XLSX.read(fileData, { type: 'array', cellDates: true }); const sheetName = workbook.SheetNames[0]; const ws = workbook.Sheets[sheetName]; const range = XLSX.utils.decode_range(ws['!ref']); const fileTimes = [], temps = [], rors = []; let maxSec = 0;
        for (let R = 1; R <= range.e.r; R++) { const timeC = ws[XLSX.utils.encode_cell({ r: R, c: 0 })], tempC = ws[XLSX.utils.encode_cell({ r: R, c: 2 })], rorC = ws[XLSX.utils.encode_cell({ r: R, c: 5 })]; if (timeC && timeC.v !== undefined && tempC && tempC.v !== undefined) { let tStr = timeC.w || timeC.v; if (timeC.t === 'n') { const d = XLSX.SSF.parse_date_code(timeC.v); tStr = `${String(d.M).padStart(2, '0')}:${String(d.S).padStart(2, '0')}`; } else if (typeof tStr !== 'string' || !tStr.includes(':')) continue; const tempV = Number(tempC.v), rorV = (rorC && !isNaN(Number(rorC.v))) ? Number(rorC.v) : null; if (!isNaN(tempV)) { fileTimes.push(tStr); temps.push(tempV); rors.push(rorV); const s = timeToSeconds(tStr); if (s > maxSec) maxSec = s; } } } if (temps.length === 0) return null; const keyPts = findKeyPoints(fileTimes, temps, rors); const clr = profileColors[index % profileColors.length]; const tempDs = { label: `온도 (${file.name})`, fileIdentifier: file.name, yAxisID: 'temp', data: temps, borderColor: clr, backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.1, hidden: false }; const rorDs = { label: `ROR (${file.name})`, fileIdentifier: file.name, yAxisID: 'ror', data: rors, borderColor: clr, backgroundColor: 'transparent', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.1, hidden: false }; return { fileName: file.name, tempDataset: tempDs, rorDataset: rorDs, keyPoints: keyPts, color: clr, maxSeconds: maxSec };
    } catch (err) { console.error(`Error processing ${file.name}:`, err); alert(`Error: ${file.name}\n${err.message}`); return null; }
}

// --- Main Application Logic ---
document.addEventListener('DOMContentLoaded', function() { // (이전과 동일)
    initChart(); const fileInput = document.getElementById('fileInput'); const checkboxContainer = document.getElementById('checkbox-container');
    fileInput.addEventListener('change', function(e) {
        const files = e.target.files; if (!files || files.length === 0) return;
        checkboxContainer.innerHTML = ''; roastingChart.data.labels = []; roastingChart.data.datasets = []; roastingChart.options.plugins.annotation.annotations = {}; maxTimeSecondsOverall = 0;
        roastingChart.options.scales.x.type = 'category'; delete roastingChart.options.scales.x.min; delete roastingChart.options.scales.x.max;
        const sortedFiles = sortFiles(files);
        const fileReadPromises = sortedFiles.map((file, index) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (event) => resolve(processExcelFile(file, index, event.target.result)); reader.onerror = reject; reader.readAsArrayBuffer(file); }));
        Promise.all(fileReadPromises).then(results => {
            const validResults = results.filter(r => r !== null); if (validResults.length === 0) { alert("No valid data found."); roastingChart.update(); return; }
            validResults.forEach(r => { if (r.maxSeconds > maxTimeSecondsOverall) maxTimeSecondsOverall = r.maxSeconds; });
            const xAxisPaddingSeconds = 90; const actualMaxSecs = maxTimeSecondsOverall + xAxisPaddingSeconds; roastingChart.data.labels = generateTimeLabels(actualMaxSecs);
            console.log(`Generated ${roastingChart.data.labels.length} labels up to ${secondsToTime(actualMaxSecs)}`);
            const totalValidFiles = validResults.length;
            validResults.forEach((result, validIndex) => {
                roastingChart.data.datasets.push(result.tempDataset); roastingChart.data.datasets.push(result.rorDataset);
                // Pass chartArea to annotation function
                if (result.keyPoints.tp) addKeyPointAnnotation('tp', result.keyPoints.tp, validIndex, totalValidFiles, result.color);
                if (result.keyPoints.y) addKeyPointAnnotation('y', result.keyPoints.y, validIndex, totalValidFiles, result.color);
                if (result.keyPoints.first) addKeyPointAnnotation('first', result.keyPoints.first, validIndex, totalValidFiles, result.color);
                if (result.keyPoints.out) addKeyPointAnnotation('out', result.keyPoints.out, validIndex, totalValidFiles, result.color);
                const originalIdx = sortedFiles.findIndex(f => f.name === result.fileName); if (originalIdx !== -1) createCheckbox(sortedFiles[originalIdx], originalIdx, result.color);
            });
            console.log(`Final X axis range determined by labels array.`); roastingChart.update();
        }).catch(error => { console.error("File processing chain error:", error); alert("File processing error."); });
        fileInput.value = '';
    });
});
// --- END OF FILE script.js ---