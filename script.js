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
// --- *** NEW: Store original styles for hover reset *** ---
const originalDatasetStyles = {}; 

// --- Helper Functions ---
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':'); if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10), seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return 0; return minutes * 60 + seconds;
}
function secondsToTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60); // Use Math.round for cleaner display
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function generateTimeLabels(maxSeconds) {
    const labels = []; if (maxSeconds < 0) return labels;
    // Generate labels at reasonable intervals (e.g., every 1 second)
    for (let s = 0; s <= maxSeconds; s++) { 
        labels.push(secondsToTime(s));
    }
    return labels;
}
function sortFiles(files) {
    return Array.from(files).sort((a, b) => {
        const nA = a.name.match(/\d+/g), nB = b.name.match(/\d+/g); const dA = a.name.match(/\d{4}[-]?\d{2}[-]?\d{2}/), dB = b.name.match(/\d{4}[-]?\d{2}[-]?\d{2}/);
        if (dA && dB) return new Date(dA[0].replace(/-/g, '/')) - new Date(dB[0].replace(/-/g, '/')); if (nA && nB) return parseInt(nA[0]) - parseInt(nB[0]); return a.name.localeCompare(b.name);
    });
}

// --- *** NEW: Helper function to fade colors *** ---
function fadeColor(color, opacity) {
    if (!color) return 'rgba(128, 128, 128, 0.1)'; // Fallback for undefined color
    // Basic Hex support
    if (color.startsWith('#')) {
        const bigint = parseInt(color.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Basic RGBA support (if already rgba, just change alpha)
    else if (color.startsWith('rgba')) {
        return color.replace(/[\d\.]+\)$/g, `${opacity})`);
    }
    // Basic RGB support
    else if (color.startsWith('rgb')) {
         return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
    }
    return color; // Return original if format not recognized
}


// --- Chart Initialization and Configuration ---
function initChart() {
    const ctx = document.getElementById('roastingChart').getContext('2d');
    if (roastingChart) {
        roastingChart.destroy(); // Destroy previous instance if exists
    }
    roastingChart = new Chart(ctx, {
        type: 'line', 
        data: { labels: [], datasets: [] },
        options: {
            responsive: true, 
            maintainAspectRatio: false, // Allow chart to fill container height
            // aspectRatio: 2.5, // Removed or adjust as needed with maintainAspectRatio: false
            layout: { padding: { top: 30, bottom: 30, left: 10, right: 10 } }, // Adjust padding
            interaction: { mode: 'index', intersect: false, axis: 'x' },
            scales: {
                x: { 
                    type: 'category', 
                    title: { display: true, text: '시간' }, 
                    ticks: { 
                        autoSkip: true, 
                        maxTicksLimit: 15, // Adjust for density vs readability
                        maxRotation: 0, 
                        // Show ticks at 30-second intervals more reliably
                        callback: function(value, index) { 
                             const label = this.getLabels()[index];
                             if (!label) return null;
                             const totalSeconds = timeToSeconds(label);
                             // Show 00:00 and every 30 seconds thereafter
                             if (totalSeconds === 0 || (totalSeconds > 0 && totalSeconds % 30 === 0)) {
                                 return label;
                             }
                             return null; // Hide other labels
                         } 
                    } 
                },
                temp: { 
                    type: 'linear', 
                    position: 'left', 
                    title: { display: true, text: '온도 (°C)' }, 
                    min: 50, 
                    suggestedMax: 250 
                },
                ror: { 
                    type: 'linear', 
                    position: 'right', 
                    title: { display: true, text: 'ROR (°C/min)' }, 
                    min: 0, 
                    suggestedMax: 25, 
                    grid: { drawOnChartArea: false } 
                }
            },
            plugins: {
                annotation: { 
                    clip: false, 
                    annotations: {} 
                }, 
                // --- *** LEGEND CONFIGURATION *** ---
                legend: { 
                    display: true, // Show the legend
                    position: 'top', // Position it at the top
                    labels: {
                        padding: 10, // Add some padding
                        boxWidth: 15, // Width of the color box
                        // Filter legend items: ONLY show Temperature lines
                        filter: function(item, chartData) {
                            const dataset = chartData.datasets[item.datasetIndex];
                            // Check if label includes '온도' and it's not hidden initially
                            return dataset.label && dataset.label.includes('온도'); 
                        },
                    },
                    // --- *** Interactive Highlighting Handlers *** ---
                    onHover: handleLegendHover,
                    onLeave: handleLegendLeave
                },
                tooltip: { 
                    callbacks: { 
                        title: (tooltipItems) => {
                             // Ensure there's a label to work with
                             return tooltipItems.length > 0 ? `시간: ${tooltipItems[0].label}` : '';
                        },
                        label: (context) => { 
                             let label = context.dataset.label || ''; 
                             const fileId = context.dataset.fileIdentifier || '';
                             // Simplify label: remove dataset type, just show file name
                             label = fileId ? `[${fileId}] ` : ''; 

                             let valueLabel = '';
                             if (context.parsed.y !== null) {
                                valueLabel = context.dataset.yAxisID === 'temp' 
                                    ? `온도: ${context.parsed.y.toFixed(1)} °C` 
                                    : `ROR: ${context.parsed.y.toFixed(1)} °C/min`;
                             }
                             return label + valueLabel; 
                         } 
                    } 
                }
            }
        }
    });
}

// --- UI Element Creation (Checkboxes) ---
function createCheckbox(file, index, color) { 
    const container = document.getElementById('checkbox-container'); 
    const checkboxDiv = document.createElement('div'); 
    // Using existing classes from HTML example - adjust if needed
    checkboxDiv.className = 'file-checkbox'; 

    const checkbox = document.createElement('input'); 
    checkbox.type = 'checkbox'; 
    checkbox.id = `file-${index}`; 
    checkbox.value = file.name; // Use file.name as value
    checkbox.checked = true; 
    // checkbox.className = 'form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out mr-2'; // Tailwind example
    checkbox.style.marginRight = '8px'; // Basic styling

    const label = document.createElement('label'); 
    label.htmlFor = `file-${index}`; 
    label.className = 'flex items-center cursor-pointer'; // For alignment if using flex

    const colorBox = document.createElement('span'); 
    colorBox.className = 'color-indicator'; // Use class from HTML for consistency
    colorBox.style.backgroundColor = color; 
    colorBox.style.border = '1px solid #ccc'; // Add a border for visibility

    const labelText = document.createElement('span'); 
    labelText.textContent = file.name; 
    // labelText.className = 'text-sm text-gray-700'; // Tailwind example
    labelText.style.fontSize = '14px'; // Basic styling

    label.appendChild(colorBox); 
    label.appendChild(labelText); 
    checkboxDiv.appendChild(checkbox); 
    checkboxDiv.appendChild(label); 
    container.appendChild(checkboxDiv);
    
    // Event listener to toggle visibility
    checkbox.addEventListener('change', function() { 
        const targetFileName = this.value; // Get the file name
        const isChecked = this.checked; 
        let datasetsUpdated = false;

        roastingChart.data.datasets.forEach((dataset, idx) => { 
            if (dataset.fileIdentifier === targetFileName) { 
                // Use Chart.js method for better state management
                roastingChart.setDatasetVisibility(idx, isChecked);
                datasetsUpdated = true;
            } 
        }); 
        
        const annotations = roastingChart.options.plugins.annotation.annotations; 
        Object.keys(annotations).forEach(key => { 
            // Match annotations based on the fileIdentifier stored in the key during creation
            if (key.includes(`-file-${targetFileName}`)) { 
                 annotations[key].display = isChecked; 
                 datasetsUpdated = true;
             }
        }); 
        
        if(datasetsUpdated) {
            roastingChart.update(); 
        }
    });
}


// --- Key Point Detection and Annotation ---
function findKeyPoints(times, temps, rors) { 
     let keyPoints = { tp: null, y: null, first: null, out: null }; 
     const tempY = 160, temp1C = 204; 
     let minRorIdx = -1, minRorVal = Infinity;
     
     // Find Turning Point (TP) - minimum ROR after temp > 70C and before ~90s (index based)
     const searchEndIndexTP = Math.min(rors.length, timeToSeconds("01:30")); // Search up to 90 seconds roughly
     for (let i = 1; i < searchEndIndexTP; i++) {
         if (temps[i] !== null && temps[i] > 70 && rors[i] !== null && rors[i] < minRorVal) { 
             minRorVal = rors[i]; 
             minRorIdx = i; 
         }
     }
     if (minRorIdx > 0 && times[minRorIdx] !== undefined && temps[minRorIdx] !== undefined) { 
          keyPoints.tp = { 
              time: times[minRorIdx], 
              temp: temps[minRorIdx], 
              ror: rors[minRorIdx], 
              index: minRorIdx // Use the index within the data array
          }; 
     }
     
     // Find Yellowing (Y) - first time temp crosses 160C
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= tempY && temps[i+1] > tempY && times[i+1] !== undefined) { 
             keyPoints.y = { time: times[i+1], temp: temps[i+1], index: i+1 }; 
             break; 
         }
     }
     
     // Find First Crack (First) - first time temp crosses 204C
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= temp1C && temps[i+1] > temp1C && times[i+1] !== undefined) { 
             keyPoints.first = { time: times[i+1], temp: temps[i+1], index: i+1 }; 
             break; 
         }
     }
     
     // Find OUT point (last data point)
     const lastIdx = temps.length - 1; 
     if (lastIdx >= 0 && temps[lastIdx] !== null && times[lastIdx] !== undefined) { 
         keyPoints.out = { 
             time: times[lastIdx], 
             temp: temps[lastIdx], 
             ror: rors[lastIdx], // May be null
             index: lastIdx 
         }; 
     } 
     return keyPoints;
}

// Function to get the actual index in the labels array based on time string
function findLabelIndex(timeStr) {
    if (!roastingChart || !roastingChart.data.labels) return -1;
    return roastingChart.data.labels.indexOf(timeStr);
}


// --- **** 라벨 오프셋 계산 함수 (Clamping 추가 버전) **** ---
function calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex) {
    // Get pixel position of the data point FIRST. Requires chart update cycle.
    // This is tricky because annotations might be calculated BEFORE the first render.
    // We'll use the *label index* as a proxy for horizontal position for now.
    const pointLabelIndex = findLabelIndex(point.time); // Find index in the *global* labels array
    const pointTemp = point.temp;

    if (pointLabelIndex < 0) {
         console.warn(`Label index for time ${point.time} not found. Cannot calculate offset accurately.`);
         return { xAdjust: 0, yAdjust: (fileIndex % 2 === 0 ? -30 : 30) }; // Default offset
    }


    // 기본 수직 방향 결정 및 파일 인덱스 따른 교차
    let baseVerticalDirection = (type === 'tp' || type === 'y') ? -1 : 1; // TP/Y 위(-), FIRST/OUT 아래(+)
    let finalVerticalDirection = (fileIndex % 2 === 0) ? baseVerticalDirection : -baseVerticalDirection;

    // 수직 거리 계산
    const baseVerticalOffset = 25; // 기본 수직 거리 
    const fileVerticalSpacing = 18; // 파일간 추가 간격
    let yAdjust = finalVerticalDirection * (baseVerticalOffset + Math.floor(fileIndex / 2) * fileVerticalSpacing);

    // --- **** 수직 오프셋 제한 (Clamping) **** ---
    const maxPixelOffsetVertical = chartArea ? chartArea.height * 0.25 : 100; // 차트 높이의 25% 또는 100px
    if (Math.abs(yAdjust) > maxPixelOffsetVertical) {
        yAdjust = Math.sign(yAdjust) * maxPixelOffsetVertical;
    }

    // 온도가 너무 낮거나 높을 때 방향 강제 (Clamping 후에도 필요할 수 있음)
     if (pointTemp < 80 && yAdjust > 0) { // 온도가 낮은데 아래로 가려 하면 강제로 위로
         yAdjust = -baseVerticalOffset - (fileIndex % 3) * fileVerticalSpacing; // 파일 3개 단위로 위로 분산
     } else if (pointTemp > 230 && yAdjust < 0) { // 온도가 높은데 위로 가려 하면 강제로 아래로
         yAdjust = baseVerticalOffset + (fileIndex % 3) * fileVerticalSpacing; // 파일 3개 단위로 아래로 분산
     }


    // --- 수평 오프셋 조정 ---
    const horizontalPositionRatio = chartArea ? (roastingChart.scales.x.getPixelForTick(pointLabelIndex) - chartArea.left) / chartArea.width : (pointLabelIndex / (roastingChart.data.labels.length || 1));
    const baseHorizontalOffset = 10; // 기본 수평 거리
    const fileHorizontalSpacing = 15; // 파일별 수평 분산 간격
    let xAdjust;

    // 분산 로직 단순화: 파일 인덱스 기반으로 좌/우 교대 배치 시도
    const xOffsetGroup = Math.floor(fileIndex / 2); // 2개 파일씩 묶음
    const xDirection = (fileIndex % 2 === 0) ? 1 : -1; // 짝수는 오른쪽, 홀수는 왼쪽

    if (horizontalPositionRatio < 0.15) { // 차트 맨 왼쪽
        xAdjust = baseHorizontalOffset + xOffsetGroup * fileHorizontalSpacing; // 오른쪽으로만 분산
    } else if (horizontalPositionRatio > 0.85) { // 차트 맨 오른쪽
        xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing; // 왼쪽으로만 분산 (텍스트 길이 고려)
    } else { // 중간 영역
         xAdjust = xDirection * (baseHorizontalOffset + 20 + xOffsetGroup * fileHorizontalSpacing);
    }


    // 라벨이 Y축 가리는 것 방지
    if (chartArea && roastingChart.scales.x.getPixelForTick(pointLabelIndex) + xAdjust < chartArea.left + 5) {
        xAdjust = (chartArea.left + 5) - roastingChart.scales.x.getPixelForTick(pointLabelIndex);
    }
    // 라벨이 오른쪽 경계 넘는 것 방지 (텍스트 너비 추정 필요 - 어려움)
    // Simplified: If near right edge and pushing right, flip to left
     if (chartArea && horizontalPositionRatio > 0.8 && xAdjust > 0) {
          xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing;
     }


    return { xAdjust, yAdjust };
}


// --- *** Annotation Function Modified to use Label Index *** ---
function addKeyPointAnnotation(type, point, fileIndex, totalFiles, color, fileName) {
    if (!point || point.time === undefined || point.temp === undefined) {
        console.warn(`Invalid point data for ${type}, file ${fileName}:`, point);
        return; 
    }

    const chartArea = roastingChart.chartArea; // Get chart area *after* potential initial render/update
    
    // Find the index in the GLOBAL labels array corresponding to the point's time
    const pointLabelIndex = findLabelIndex(point.time);

    if (pointLabelIndex < 0) {
         console.warn(`Annotation Error: Time label '${point.time}' not found for ${type} in file ${fileName}. Skipping annotation.`);
         return; // Cannot place annotation if the label doesn't exist
    }

    // ** calculateLabelOffset 호출 시 chartArea 전달 **
    const { xAdjust, yAdjust } = calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex);

    // Use a unique identifier including the filename for annotation keys
    const annotationPrefix = `${type}-file-${fileName}`; // Include filename

    // --- Label Annotation ---
    const labelAnnotation = {
        type: 'label', 
        xValue: point.time, // Use the time string label itself for xValue with category axis
        yValue: point.temp,
        xScaleID: 'x', // Explicitly link to the category axis
        yScaleID: 'temp',
        yAdjust: yAdjust, 
        xAdjust: xAdjust, 
        content: [`${type.toUpperCase()}: ${point.time}`, `${point.temp.toFixed(1)}°C`].filter(Boolean),
        backgroundColor: 'rgba(255, 255, 255, 0.9)', 
        borderColor: color,
        borderWidth: 1, 
        borderRadius: 4, 
        padding: 4, 
        textAlign: 'left',
        font: { size: 10 },
        display: true // Initially visible, checkbox controls later
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-label`] = labelAnnotation;

    // --- Point Annotation ---
    const pointAnnotation = {
        type: 'point', 
        xValue: point.time, // Use time string label
        yValue: point.temp, 
        xScaleID: 'x',
        yScaleID: 'temp',
        backgroundColor: color, 
        borderColor: 'white', 
        borderWidth: 1, 
        radius: 4, 
        display: true 
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-point`] = pointAnnotation;

    // --- Line Annotation ---
    // Line needs careful coordinate calculation with category axis and adjustments
    // Simple vertical line for now, adjusted with yAdjust
     const lineAnnotation = {
         type: 'line',
         xMin: point.time, // Use time string label
         xMax: point.time, // Use time string label
         xScaleID: 'x',
         yScaleID: 'temp',
          // Adjust yMin/yMax based on yAdjust direction to connect point and label base
         yMin: point.temp + Math.min(0, yAdjust) + (yAdjust < 0 ? 5 : 0), // Line starts closer to point
         yMax: point.temp + Math.max(0, yAdjust) + (yAdjust > 0 ? -5 : 0),// Line ends closer to point
         borderColor: color,
         borderWidth: 1,
         borderDash: [2, 2],
         display: true // Controlled by checkbox later implicitly via label
     };

     // Only draw line if label is sufficiently far
     if (Math.abs(yAdjust) > 10) {
        roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`] = lineAnnotation;
     } else {
         // If line would be too short, remove it (or don't add it)
         delete roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`];
     }
}


// --- Excel File Processing ---
function processExcelFile(file, index, fileData) { 
    try { 
        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true }); 
        const sheetName = workbook.SheetNames[0]; 
        const ws = workbook.Sheets[sheetName]; 
        
        // --- Robust Data Extraction ---
        // Use sheet_to_json for easier row/column access, assuming headers in row 1 (index 0)
        // Adjust 'header' and 'range' if your structure differs.
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 }); 
        
        const fileTimes = [], temps = [], rors = []; 
        let maxSec = 0;
        let headerRow = jsonData[0]; // Assuming first row is header
        
        // Find column indices dynamically (more robust)
        let timeCol = -1, tempCol = -1, rorCol = -1;
        if (headerRow) {
             // Common variations for column names
             const timeKeywords = ['time', '시간'];
             const tempKeywords = ['temp', 'bt', '온도'];
             const rorKeywords = ['ror', 'dr']; // Add more if needed
             
             headerRow.forEach((header, colIndex) => {
                const lowerHeader = String(header).toLowerCase();
                if (timeCol === -1 && timeKeywords.some(k => lowerHeader.includes(k))) timeCol = colIndex;
                if (tempCol === -1 && tempKeywords.some(k => lowerHeader.includes(k))) tempCol = colIndex;
                if (rorCol === -1 && rorKeywords.some(k => lowerHeader.includes(k))) rorCol = colIndex;
             });
        }

        // Fallback to fixed columns if dynamic search fails
        if (timeCol === -1) timeCol = 0; // Default A
        if (tempCol === -1) tempCol = 2; // Default C
        if (rorCol === -1) rorCol = 5; // Default F

        console.log(`File: ${file.name} - Using Columns: Time(${timeCol}), Temp(${tempCol}), ROR(${rorCol})`);

        // Start processing data from row 2 (index 1)
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const timeVal = row[timeCol];
            const tempVal = row[tempCol];
            const rorVal = row[rorCol];

            let tStr = null;
            // Handle time: could be number (Excel date code) or string (mm:ss)
            if (typeof timeVal === 'number') {
                 const excelEpoch = new Date(1899, 11, 30); // Excel epoch start date
                 const jsDate = new Date(excelEpoch.getTime() + timeVal * 86400000);
                 // Extract time part if it's a full date-time
                 if (timeVal < 1) { // If it's just a time value (fraction of a day)
                     const totalSecondsRaw = Math.round(timeVal * 86400); // Total seconds in the day part
                     const d = {
                         M: Math.floor(totalSecondsRaw / 60) % 60,
                         S: totalSecondsRaw % 60
                     };
                      tStr = `${String(d.M).padStart(2, '0')}:${String(d.S).padStart(2, '0')}`;
                 } else {
                     // Fallback if it looks like a full date, maybe extract time? Needs specific format handling.
                     console.warn(`Unexpected numeric time format in ${file.name}, row ${i+1}: ${timeVal}`);
                     continue; // Skip if unsure how to handle
                 }
            } else if (typeof timeVal === 'string' && timeVal.includes(':')) {
                // Assume "mm:ss" or similar format
                tStr = timeVal.split(':').map(part => String(parseInt(part, 10)).padStart(2, '0')).join(':'); 
                 // Basic validation: check if parts are numbers after parsing
                 const partsCheck = tStr.split(':');
                 if(partsCheck.length !== 2 || isNaN(parseInt(partsCheck[0],10)) || isNaN(parseInt(partsCheck[1],10))) {
                     console.warn(`Skipping invalid time string format in ${file.name}, row ${i+1}: ${timeVal}`);
                     continue; 
                 }
            } else if (timeVal instanceof Date) {
                 tStr = `${String(timeVal.getMinutes()).padStart(2, '0')}:${String(timeVal.getSeconds()).padStart(2, '0')}`;
            }
             else {
                 // Skip if time format is unusable
                 if (timeVal !== undefined) console.warn(`Skipping row ${i+1} in ${file.name} due to unrecognized time format:`, timeVal);
                 continue; 
            }

            const tempV = Number(tempVal);
            const rorV = (rorVal !== undefined && rorVal !== null && !isNaN(Number(rorVal))) ? Number(rorVal) : null;

            if (!isNaN(tempV) && tStr) {
                const currentSeconds = timeToSeconds(tStr);
                // Ensure time is progressing, prevent duplicates unless temp also changes
                 if (fileTimes.length === 0 || currentSeconds > timeToSeconds(fileTimes[fileTimes.length - 1]) || temps[temps.length-1] !== tempV) {
                     fileTimes.push(tStr); 
                     temps.push(tempV); 
                     rors.push(rorV); 
                     if (currentSeconds > maxSec) maxSec = currentSeconds; 
                 } else if (currentSeconds === timeToSeconds(fileTimes[fileTimes.length - 1])) {
                      // If time is the same, update the last point's temp/ROR if different (overwrite)
                      temps[temps.length - 1] = tempV;
                      rors[rors.length - 1] = rorV;
                 } // else: time goes backward - ignore
                 
            } else {
                 // Log skipped rows due to invalid temp or time string issues
                 if (tStr && isNaN(tempV) && tempVal !== undefined) console.warn(`Skipping row ${i+1} in ${file.name} due to invalid temperature:`, tempVal);
            }
        } 
        
        if (temps.length === 0) {
            console.warn(`No valid data points extracted from ${file.name}.`);
            return null;
        } 

        const keyPts = findKeyPoints(fileTimes, temps, rors); 
        const clr = profileColors[index % profileColors.length]; 

        // Ensure data has values for all generated labels (fill gaps with null)
        // This is essential for category axis if time points are missing
        const fullTemps = new Array(roastingChart.data.labels.length).fill(null);
        const fullRors = new Array(roastingChart.data.labels.length).fill(null);
        fileTimes.forEach((t, dataIndex) => {
            const labelIndex = findLabelIndex(t);
            if (labelIndex !== -1) {
                fullTemps[labelIndex] = temps[dataIndex];
                fullRors[labelIndex] = rors[dataIndex];
            }
        });
        
        // Create Datasets
        const tempDs = { 
            label: `온도 (${file.name})`, 
            fileIdentifier: file.name, 
            yAxisID: 'temp', 
            data: fullTemps, // Use data aligned with global labels
            borderColor: clr, 
            backgroundColor: 'transparent', 
            borderWidth: 1.5, 
            pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, 
            hidden: false,
            spanGaps: true // Connect lines across null points
        }; 
        const rorDs = { 
            label: `ROR (${file.name})`, 
            fileIdentifier: file.name, 
            yAxisID: 'ror', 
            data: fullRors, // Use data aligned with global labels
            borderColor: clr, 
            backgroundColor: 'transparent', 
            borderDash: [4, 4], 
            borderWidth: 1.5, 
            pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, 
            hidden: false,
            spanGaps: true // Connect lines across null points
        }; 

        // --- *** Store original styles *** ---
        originalDatasetStyles[tempDs.label] = { borderWidth: tempDs.borderWidth, borderColor: tempDs.borderColor };
        originalDatasetStyles[rorDs.label] = { borderWidth: rorDs.borderWidth, borderColor: rorDs.borderColor };

        return { 
            fileName: file.name, 
            tempDataset: tempDs, 
            rorDataset: rorDs, 
            keyPoints: keyPts, 
            color: clr, 
            maxSeconds: maxSec 
        };
    } catch (err) { 
        console.error(`Error processing ${file.name}:`, err); 
        alert(`Error reading or processing file: ${file.name}\n${err.message}\nPlease ensure it's a valid Excel file and check console for details.`); 
        return null; 
    }
}

// --- *** NEW: Legend Hover Handlers *** ---

function handleLegendHover(evt, item, legend) {
    if (!roastingChart || !item) return;
    const hoveredIndex = item.datasetIndex;
    const hoveredDataset = legend.chart.data.datasets[hoveredIndex];

    if (!hoveredDataset || !hoveredDataset.fileIdentifier) return; // Should not happen with filter, but check

    const fileId = hoveredDataset.fileIdentifier;
    const hoverHighlightWidth = 3; // Thicker width for highlighted lines

    legend.chart.data.datasets.forEach((dataset, index) => {
        const meta = legend.chart.getDatasetMeta(index);
        if (meta.hidden) return; // Skip hidden datasets

        // Ensure original style is stored (should be, but double-check)
        if (!originalDatasetStyles[dataset.label]) {
             originalDatasetStyles[dataset.label] = { borderWidth: dataset.borderWidth, borderColor: dataset.borderColor };
        }
        
        if (dataset.fileIdentifier === fileId) {
            // Highlight BOTH Temp and ROR lines for the hovered file
            dataset.borderWidth = hoverHighlightWidth;
            // Make sure it uses the original color (in case it was faded)
            dataset.borderColor = originalDatasetStyles[dataset.label].borderColor; 
        } else {
            // Fade other lines
            dataset.borderColor = fadeColor(originalDatasetStyles[dataset.label].borderColor, 0.2); // Fade to 20% opacity
            // Optionally keep original width or make thinner
            dataset.borderWidth = originalDatasetStyles[dataset.label].borderWidth; 
        }
    });
    legend.chart.update('none'); // Update without animation
}

function handleLegendLeave(evt, item, legend) {
    if (!roastingChart || !item) return;
    
    legend.chart.data.datasets.forEach((dataset, index) => {
        const meta = legend.chart.getDatasetMeta(index);
        if (meta.hidden) return; // Skip hidden datasets

        // Restore from stored original styles
        if (originalDatasetStyles[dataset.label]) {
            dataset.borderWidth = originalDatasetStyles[dataset.label].borderWidth;
            dataset.borderColor = originalDatasetStyles[dataset.label].borderColor;
        } else {
            // Fallback if original somehow wasn't stored (shouldn't happen often)
            dataset.borderWidth = dataset.label.includes('ROR') ? 1.5 : 1.5; // Default widths
            dataset.borderColor = profileColors[index % profileColors.length]; // Guess color
        }
    });
    legend.chart.update('none'); // Update without animation
}


// --- Main Application Logic ---
document.addEventListener('DOMContentLoaded', function() { 
    initChart(); // Initialize chart structure once on load
    const fileInput = document.getElementById('fileInput'); 
    const checkboxContainer = document.getElementById('checkbox-container');
    
    fileInput.addEventListener('change', function(e) {
        const files = e.target.files; 
        if (!files || files.length === 0) return;
        
        // --- Reset ---
        checkboxContainer.innerHTML = ''; // Clear checkboxes
        if (roastingChart) {
             roastingChart.data.labels = [];
             roastingChart.data.datasets = [];
             roastingChart.options.plugins.annotation.annotations = {};
             // Clear stored styles
             Object.keys(originalDatasetStyles).forEach(key => delete originalDatasetStyles[key]); 
        } else {
             initChart(); // Re-initialize if chart was somehow destroyed
        }
        maxTimeSecondsOverall = 0; 
        
        // --- Process Files ---
        const sortedFiles = sortFiles(files);
        const fileReadPromises = sortedFiles.map(file => 
            new Promise((resolve, reject) => { 
                const reader = new FileReader(); 
                reader.onload = (event) => resolve({ file: file, data: event.target.result }); // Pass file obj too
                reader.onerror = (err) => reject({ file: file, error: err }); 
                reader.readAsArrayBuffer(file); 
            })
        );

        Promise.all(fileReadPromises).then(results => {
            // --- First Pass: Determine Max Time and Generate Labels ---
            const processedData = [];
            results.forEach((result, index) => {
                 if (result.data) {
                     // Temporarily process just to find max time (less efficient but needed for category axis)
                     // NOTE: This means reading the file twice essentially. Consider optimizing later if slow.
                     try {
                         const workbook = XLSX.read(result.data, { type: 'array' });
                         const sheetName = workbook.SheetNames[0];
                         const ws = workbook.Sheets[sheetName];
                         const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 });
                         let maxSec = 0;
                         let timeCol = 0; // Assume column A for time for this quick check
                         // Simple loop to find max time string
                         for (let i = 1; i < jsonData.length; i++) {
                              const timeVal = jsonData[i][timeCol];
                              let tStr = null;
                              if(typeof timeVal === 'number' && timeVal < 1) { // Excel time number
                                  const totalSecondsRaw = Math.round(timeVal * 86400);
                                  const M = Math.floor(totalSecondsRaw / 60) % 60;
                                  const S = totalSecondsRaw % 60;
                                  tStr = `${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}`;
                              } else if (typeof timeVal === 'string' && timeVal.includes(':')) {
                                  tStr = timeVal;
                              }
                              if(tStr) {
                                  const s = timeToSeconds(tStr);
                                  if (s > maxSec) maxSec = s;
                              }
                         }
                          if (maxSec > maxTimeSecondsOverall) maxTimeSecondsOverall = maxSec;
                          processedData.push({ file: result.file, data: result.data, index: index }); // Store data for next step

                     } catch (err) {
                          console.error(`Error during pre-processing ${result.file.name}:`, err);
                          alert(`Failed to pre-process ${result.file.name}. It might be corrupted or in an unexpected format.`);
                     }
                 } else if (result.error) {
                     console.error(`Error reading file ${result.file.name}:`, result.error);
                     alert(`Error reading file: ${result.file.name}`);
                 }
            });

            if (processedData.length === 0) {
                 alert("No files could be read or processed.");
                 roastingChart.update(); // Update empty chart
                 return;
            }

            const xAxisPaddingSeconds = 30; // Add less padding
            const actualMaxSecs = maxTimeSecondsOverall + xAxisPaddingSeconds; 
            roastingChart.data.labels = generateTimeLabels(actualMaxSecs); // Generate labels based on overall max time
            console.log(`Generated ${roastingChart.data.labels.length} labels up to ${secondsToTime(actualMaxSecs)}`);

            // --- Second Pass: Process Data and Add to Chart ---
            const finalValidResults = [];
            processedData.forEach(item => {
                const result = processExcelFile(item.file, item.index, item.data); // Now process fully
                if (result) {
                    finalValidResults.push(result);
                }
            });
            
            if (finalValidResults.length === 0) {
                 alert("No valid roasting data found in the selected files.");
                 roastingChart.update(); // Update empty chart
                 return; 
            }

            const totalValidFiles = finalValidResults.length;
            finalValidResults.forEach((result, validIndex) => {
                 // Add datasets first
                roastingChart.data.datasets.push(result.tempDataset);
                roastingChart.data.datasets.push(result.rorDataset);
                
                // Create checkbox for this file
                 const originalFileObject = sortedFiles.find(f => f.name === result.fileName);
                 if (originalFileObject) {
                     // Find the original overall index for consistent ID/color if needed
                     const originalIndex = sortedFiles.indexOf(originalFileObject);
                     createCheckbox(originalFileObject, result.fileName, result.color); // Use filename as ID
                 } else {
                      console.warn("Could not find original file object for checkbox:", result.fileName);
                 }
            });

            // --- Update Chart Once After Adding Datasets ---
            // This is important for scales and chartArea to be calculated before annotations
            roastingChart.update(); 

            // --- Add Annotations (Now that chartArea is available) ---
            finalValidResults.forEach((result, validIndex) => {
                 // Pass filename for unique annotation keys
                 const fileName = result.fileName; 
                if (result.keyPoints.tp) addKeyPointAnnotation('tp', result.keyPoints.tp, validIndex, totalValidFiles, result.color, fileName);
                if (result.keyPoints.y) addKeyPointAnnotation('y', result.keyPoints.y, validIndex, totalValidFiles, result.color, fileName);
                if (result.keyPoints.first) addKeyPointAnnotation('first', result.keyPoints.first, validIndex, totalValidFiles, result.color, fileName);
                if (result.keyPoints.out) addKeyPointAnnotation('out', result.keyPoints.out, validIndex, totalValidFiles, result.color, fileName);
            });

            console.log("Chart update including annotations.");
            roastingChart.update(); // Final update with annotations

        }).catch(errorInfo => { 
            // Catch errors from Promise.all (likely file reading errors)
            console.error("Error reading one or more files:", errorInfo); 
            alert(`Error during file reading: ${errorInfo.file?.name || 'Unknown file'}\n${errorInfo.error || 'Unknown error'}`); 
            // Update chart even if some files failed
            roastingChart.update();
        });
        
        fileInput.value = ''; // Clear the input after processing
    });
});
// --- END OF FILE script.js ---
