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
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':'); if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10), seconds = parseInt(parts[1], 10);
    // Handle potential fractional seconds (e.g., "01:30.5") - use parseFloat for seconds
    if (isNaN(minutes) || isNaN(parseFloat(parts[1]))) return 0; 
    return minutes * 60 + parseFloat(parts[1]); // Use parseFloat for seconds
}

function secondsToTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    // Round seconds to avoid excessive decimal places in labels, or use floor/ceil as needed
    const seconds = Math.round(totalSeconds % 60); 
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function generateTimeLabels(maxSeconds) {
    const labels = []; if (maxSeconds < 0) return labels;
    // Generate labels every 1 second up to the max
    for (let s = 0; s <= Math.ceil(maxSeconds); s++) { // Use Math.ceil to include the last second
        labels.push(secondsToTime(s));
    }
    return labels;
}

function sortFiles(files) {
    return Array.from(files).sort((a, b) => {
        // Attempt to extract date first (YYYYMMDD or YYYY-MM-DD format)
        const dateRegex = /(\d{4})[-]?(\d{2})[-]?(\d{2})/;
        const dA = a.name.match(dateRegex);
        const dB = b.name.match(dateRegex);
        if (dA && dB) {
            const dateA = new Date(parseInt(dA[1]), parseInt(dA[2]) - 1, parseInt(dA[3]));
            const dateB = new Date(parseInt(dB[1]), parseInt(dB[2]) - 1, parseInt(dB[3]));
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA - dateB;
            }
        }
        // If dates are same or not found, try sorting by numbers in the filename
        const numRegex = /(\d+)/g;
        const nA = a.name.match(numRegex);
        const nB = b.name.match(numRegex);
        if (nA && nB) {
            // Compare numbers sequentially
            for (let i = 0; i < Math.min(nA.length, nB.length); i++) {
                const numA = parseInt(nA[i]);
                const numB = parseInt(nB[i]);
                if (numA !== numB) {
                    return numA - numB;
                }
            }
             // If numbers are the same so far, shorter sequence comes first (e.g., file1 vs file10)
            if (nA.length !== nB.length) {
                return nA.length - nB.length;
            }
        }
        // Fallback to simple alphabetical sort
        return a.name.localeCompare(b.name);
    });
}

// --- Helper function to fade colors ---
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
            layout: { padding: { top: 30, bottom: 30, left: 10, right: 10 } }, 
            interaction: { 
                mode: 'index', // Show tooltips for all datasets at the same x-index
                intersect: false, // Trigger hover/tooltip even if not directly over a point
                axis: 'x' // Interaction primarily driven by x-axis hovering
            },
            scales: {
                x: { 
                    type: 'category', // Using category scale based on generated labels
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
                             // Show 00:00 and every 30 seconds thereafter (or adjust interval)
                             if (totalSeconds === 0 || (totalSeconds > 0 && totalSeconds % 30 === 0)) {
                                 return label;
                             }
                             return null; // Hide other labels for clarity
                         } 
                    } 
                },
                temp: { // Left Y-axis for Temperature
                    type: 'linear', 
                    position: 'left', 
                    title: { display: true, text: '온도 (°C)' }, 
                    min: 50, // Sensible minimum temperature
                    suggestedMax: 250 // Adjust based on typical roasting temps
                },
                ror: { // Right Y-axis for ROR
                    type: 'linear', 
                    position: 'right', 
                    title: { display: true, text: 'ROR (°C/min)' }, 
                    min: 0, // ROR typically doesn't go below 0
                    suggestedMax: 25, // Adjust based on typical ROR values
                    grid: { drawOnChartArea: false } // Hide grid lines for ROR axis on chart area
                }
            },
            plugins: {
                annotation: { 
                    clip: false, // Allow annotations slightly outside chart area
                    annotations: {} // Annotations will be added dynamically
                }, 
                // --- LEGEND Configuration ---
                legend: { 
                    display: true, // Show the legend
                    position: 'top', // Position it at the top
                    labels: {
                        padding: 10, // Add some padding
                        boxWidth: 15, // Width of the color box
                        // Filter legend items: ONLY show Temperature lines ("온도" in label)
                        filter: function(item, chartData) {
                            const dataset = chartData.datasets[item.datasetIndex];
                            // Check if label includes '온도'
                            return dataset.label && dataset.label.includes('온도'); 
                        },
                    },
                    // --- Interactive Highlighting Handlers ---
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
                             // Simplify label for tooltip: Show filename and value
                             label = fileId ? `[${fileId}] ` : ''; 

                             let valueLabel = '';
                             if (context.parsed.y !== null && !isNaN(context.parsed.y)) { // Check if y is a valid number
                                valueLabel = context.dataset.yAxisID === 'temp' 
                                    ? `온도: ${context.parsed.y.toFixed(1)} °C` 
                                    : `ROR: ${context.parsed.y.toFixed(1)} °C/min`;
                             } else {
                                 valueLabel = context.dataset.yAxisID === 'temp' ? '온도: -' : 'ROR: -'; // Indicate missing data
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
function createCheckbox(file, fileIdentifier, color) { // Use fileIdentifier for value
    const container = document.getElementById('checkbox-container'); 
    const checkboxDiv = document.createElement('div'); 
    checkboxDiv.className = 'file-checkbox'; // Use class from HTML for consistency

    const checkbox = document.createElement('input'); 
    checkbox.type = 'checkbox'; 
    // Use a unique ID based on fileIdentifier (remove special chars)
    checkbox.id = `cb-${fileIdentifier.replace(/[^a-zA-Z0-9]/g, '-')}`; 
    checkbox.value = fileIdentifier; // Use the clean identifier
    checkbox.checked = true; 
    checkbox.style.marginRight = '8px'; // Basic styling

    const label = document.createElement('label'); 
    label.htmlFor = checkbox.id; 
    label.className = 'flex items-center cursor-pointer'; // For alignment if using flex

    const colorBox = document.createElement('span'); 
    colorBox.className = 'color-indicator'; // Use class from HTML for consistency
    colorBox.style.backgroundColor = color; 
    colorBox.style.border = '1px solid #ccc'; // Add a border for visibility

    const labelText = document.createElement('span'); 
    labelText.textContent = file.name; // Show original filename in label
    labelText.style.fontSize = '14px'; // Basic styling

    label.appendChild(colorBox); 
    label.appendChild(labelText); 
    checkboxDiv.appendChild(checkbox); 
    checkboxDiv.appendChild(label); 
    container.appendChild(checkboxDiv);
    
    // Event listener to toggle visibility
    checkbox.addEventListener('change', function() { 
        const targetFileId = this.value; // Get the file identifier
        const isChecked = this.checked; 
        let datasetsUpdated = false;

        roastingChart.data.datasets.forEach((dataset, idx) => { 
            if (dataset.fileIdentifier === targetFileId) { 
                // Use Chart.js method for better state management
                roastingChart.setDatasetVisibility(idx, isChecked);
                datasetsUpdated = true;
            } 
        }); 
        
        const annotations = roastingChart.options.plugins.annotation.annotations; 
        Object.keys(annotations).forEach(key => { 
            // Match annotations based on the fileIdentifier stored in the key during creation
            // Ensure the key format matches how it's created in addKeyPointAnnotation
            if (key.includes(`-file-${targetFileId}`)) { 
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
     // (This function logic remains the same as before, finds points based on temp/ror values)
     let keyPoints = { tp: null, y: null, first: null, out: null }; 
     const tempY = 160, temp1C = 204; 
     let minRorIdx = -1, minRorVal = Infinity;
     
     const searchEndIndexTP = Math.min(rors.length, timeToSeconds("01:30")); 
     for (let i = 1; i < searchEndIndexTP; i++) {
         if (temps[i] !== null && temps[i] > 70 && rors[i] !== null && rors[i] < minRorVal) { 
             minRorVal = rors[i]; minRorIdx = i; 
         }
     }
     if (minRorIdx > 0 && times[minRorIdx] !== undefined && temps[minRorIdx] !== undefined) { 
          keyPoints.tp = { time: times[minRorIdx], temp: temps[minRorIdx], ror: rors[minRorIdx] }; 
     }
     
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= tempY && temps[i+1] > tempY && times[i+1] !== undefined) { 
             keyPoints.y = { time: times[i+1], temp: temps[i+1] }; 
             break; 
         }
     }
     
     for (let i = 0; i < temps.length - 1; i++) {
         if (temps[i] !== null && temps[i+1] !== null && temps[i] <= temp1C && temps[i+1] > temp1C && times[i+1] !== undefined) { 
             keyPoints.first = { time: times[i+1], temp: temps[i+1] }; 
             break; 
         }
     }
     
     const lastIdx = temps.length - 1; 
     if (lastIdx >= 0 && temps[lastIdx] !== null && times[lastIdx] !== undefined) { 
         keyPoints.out = { time: times[lastIdx], temp: temps[lastIdx], ror: rors[lastIdx] }; 
     } 
     return keyPoints;
}

// Function to get the index in the global labels array based on time string
function findLabelIndex(timeStr) {
    if (!roastingChart || !roastingChart.data.labels) return -1;
    // Find the closest matching label if exact match fails due to rounding/parsing differences
    let exactIndex = roastingChart.data.labels.indexOf(timeStr);
    if (exactIndex !== -1) return exactIndex;

    // Fallback: find the index of the label closest in time (in seconds)
    const targetSeconds = timeToSeconds(timeStr);
    let closestIndex = -1;
    let minDiff = Infinity;
    roastingChart.data.labels.forEach((label, index) => {
        const labelSeconds = timeToSeconds(label);
        const diff = Math.abs(labelSeconds - targetSeconds);
        if (diff < minDiff && diff < 1) { // Allow small difference (e.g., less than 1 second)
             minDiff = diff;
             closestIndex = index;
        }
    });
    // if(closestIndex === -1) console.warn(`Label index for time ${timeStr} not found.`);
    return closestIndex; 
}

// --- Label Offset Calculation (attempt to avoid overlap) ---
function calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex) {
    // (This function logic remains the same, calculates pixel offsets)
    const pointLabelIndex = findLabelIndex(point.time); 
    const pointTemp = point.temp;

    if (pointLabelIndex < 0) {
         return { xAdjust: 0, yAdjust: (fileIndex % 2 === 0 ? -30 : 30) }; // Default if index not found
    }

    let baseVerticalDirection = (type === 'tp' || type === 'y') ? -1 : 1; 
    let finalVerticalDirection = (fileIndex % 2 === 0) ? baseVerticalDirection : -baseVerticalDirection;
    const baseVerticalOffset = 25; 
    const fileVerticalSpacing = 18; 
    let yAdjust = finalVerticalDirection * (baseVerticalOffset + Math.floor(fileIndex / 2) * fileVerticalSpacing);

    const maxPixelOffsetVertical = chartArea ? chartArea.height * 0.25 : 100; 
    if (Math.abs(yAdjust) > maxPixelOffsetVertical) {
        yAdjust = Math.sign(yAdjust) * maxPixelOffsetVertical;
    }

    if (pointTemp < 80 && yAdjust > 0) { 
         yAdjust = -baseVerticalOffset - (fileIndex % 3) * fileVerticalSpacing; 
     } else if (pointTemp > 230 && yAdjust < 0) { 
         yAdjust = baseVerticalOffset + (fileIndex % 3) * fileVerticalSpacing; 
     }

    const xPixel = chartArea ? roastingChart.scales.x.getPixelForTick(pointLabelIndex) : 0;
    const horizontalPositionRatio = chartArea ? (xPixel - chartArea.left) / chartArea.width : (pointLabelIndex / (roastingChart.data.labels.length || 1));
    const baseHorizontalOffset = 10; 
    const fileHorizontalSpacing = 15; 
    let xAdjust;
    const xOffsetGroup = Math.floor(fileIndex / 2); 
    const xDirection = (fileIndex % 2 === 0) ? 1 : -1; 

    if (horizontalPositionRatio < 0.15) { 
        xAdjust = baseHorizontalOffset + xOffsetGroup * fileHorizontalSpacing; 
    } else if (horizontalPositionRatio > 0.85) { 
        xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing; 
    } else { 
         xAdjust = xDirection * (baseHorizontalOffset + 20 + xOffsetGroup * fileHorizontalSpacing);
    }

    if (chartArea && xPixel + xAdjust < chartArea.left + 5) {
        xAdjust = (chartArea.left + 5) - xPixel;
    }
     if (chartArea && horizontalPositionRatio > 0.8 && xAdjust > 0) {
          xAdjust = -baseHorizontalOffset - 50 - xOffsetGroup * fileHorizontalSpacing;
     }

    return { xAdjust, yAdjust };
}

// --- Add Key Point Annotation ---
function addKeyPointAnnotation(type, point, fileIndex, totalFiles, color, fileIdentifier) {
    // (This function logic remains the same, uses calculated offsets)
    if (!point || point.time === undefined || point.temp === undefined) {
        console.warn(`Invalid point data for ${type}, file ${fileIdentifier}:`, point);
        return; 
    }
    const chartArea = roastingChart.chartArea; // Get chart area *after* potential initial render/update
    const pointLabelIndex = findLabelIndex(point.time);

    if (pointLabelIndex < 0) {
         console.warn(`Annotation Error: Time label '${point.time}' not found for ${type} in file ${fileIdentifier}. Skipping annotation.`);
         return; 
    }
    const { xAdjust, yAdjust } = calculateLabelOffset(type, point, chartArea, totalFiles, fileIndex);
    const annotationPrefix = `${type}-file-${fileIdentifier}`; // Unique key

    const labelAnnotation = {
        type: 'label', xValue: point.time, yValue: point.temp,
        xScaleID: 'x', yScaleID: 'temp',
        yAdjust: yAdjust, xAdjust: xAdjust, 
        content: [`${type.toUpperCase()}: ${point.time}`, `${point.temp.toFixed(1)}°C`],
        backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: color,
        borderWidth: 1, borderRadius: 4, padding: 4, textAlign: 'left',
        font: { size: 10 }, display: true 
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-label`] = labelAnnotation;

    const pointAnnotation = {
        type: 'point', xValue: point.time, yValue: point.temp, 
        xScaleID: 'x', yScaleID: 'temp',
        backgroundColor: color, borderColor: 'white', borderWidth: 1, radius: 4, display: true 
    };
    roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-point`] = pointAnnotation;

     const lineAnnotation = {
         type: 'line', xMin: point.time, xMax: point.time,
         xScaleID: 'x', yScaleID: 'temp',
         yMin: point.temp + Math.min(0, yAdjust) + (yAdjust < 0 ? 5 : 0), 
         yMax: point.temp + Math.max(0, yAdjust) + (yAdjust > 0 ? -5 : 0),
         borderColor: color, borderWidth: 1, borderDash: [2, 2], display: true 
     };
     if (Math.abs(yAdjust) > 10) {
        roastingChart.options.plugins.annotation.annotations[`${annotationPrefix}-line`] = lineAnnotation;
     } else {
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
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: false, dateNF:'m:ss'}); // raw: false for formatted strings, dateNF for time hint
        
        const fileTimes = [], temps = [], rors = []; 
        let maxSec = 0;
        let headerRow = jsonData[0] || []; // Ensure headerRow is an array

        // Find column indices dynamically 
        let timeCol = -1, tempCol = -1, rorCol = -1;
        
        // Prioritize specific keywords for Bean Temp (C) and Bean ROR (F)
        const timeKeywords = ['time', '시간'];
        const tempKeywords = ['bt', 'bean temp', '원두 온도', '원두표면', 'temp', '온도']; // Prioritize BT/Bean
        const rorKeywords = ['bt ror', 'bean ror', '원두표면 ror', 'ror', 'dr']; // Prioritize BT/Bean ROR
             
        headerRow.forEach((header, colIndex) => {
           const lowerHeader = String(header || '').toLowerCase().trim(); // Handle potential null/undefined headers
           if (timeCol === -1 && timeKeywords.some(k => lowerHeader.includes(k))) timeCol = colIndex;
           if (tempCol === -1 && tempKeywords.some(k => lowerHeader.includes(k))) tempCol = colIndex;
           if (rorCol === -1 && rorKeywords.some(k => lowerHeader.includes(k))) rorCol = colIndex;
        });

        // --- *** IMPORTANT: Fallback to user-specified columns *** ---
        // Use specified columns C (2) for Temp and F (5) for ROR if dynamic search fails.
        if (timeCol === -1) timeCol = 0;  // 시간: A열 (인덱스 0)
        if (tempCol === -1) tempCol = 2;  // 온도: C열 (인덱스 2) <<< USER SPECIFIED
        if (rorCol === -1) rorCol = 5;  // ROR:  F열 (인덱스 5) <<< USER SPECIFIED

        console.log(`파일: ${file.name} - 사용할 열: 시간(${timeCol}), 원두온도(${tempCol}), 원두ROR(${rorCol})`); // Log updated names

        // Start processing data from row 2 (index 1) - Assuming header is row 1
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row) continue; // Skip empty rows

            const timeVal = row[timeCol];
            const tempVal = row[tempCol]; // Read from Column C (or dynamically found)
            const rorVal = row[rorCol];   // Read from Column F (or dynamically found)

            let tStr = null;
            // Handle time: String (mm:ss or mm:ss.f), Number (Excel time), Date object
            if (typeof timeVal === 'string' && timeVal.includes(':')) {
                const parts = timeVal.split(':');
                if(parts.length === 2 && !isNaN(parseInt(parts[0], 10)) && !isNaN(parseFloat(parts[1]))) {
                     // Format consistently to mm:ss
                     const m = String(parseInt(parts[0], 10)).padStart(2, '0');
                     // Round seconds part for label consistency, but use float for calculations
                     const sFloat = parseFloat(parts[1]);
                     const s = String(Math.round(sFloat)).padStart(2, '0'); 
                     tStr = `${m}:${s}`;
                 } else {
                     // console.warn(`Skipping invalid time string format: ${timeVal}`); continue;
                 }
            } else if (typeof timeVal === 'number' && timeVal < 2) { // Assume Excel time number (fraction of a day)
                 const totalSecondsRaw = timeVal * 86400; // Total seconds in the day part
                 tStr = secondsToTime(totalSecondsRaw); // Convert to mm:ss
            } else if (timeVal instanceof Date) {
                 tStr = `${String(timeVal.getMinutes()).padStart(2, '0')}:${String(timeVal.getSeconds()).padStart(2, '0')}`;
            } else {
                 // console.warn(`Skipping row ${i+1} due to unrecognized time format:`, timeVal);
                 continue; 
            }

            // Ensure temperature is a valid number
            const tempV = Number(tempVal);
            if (isNaN(tempV)) {
                // console.warn(`Skipping row ${i+1} due to invalid temperature:`, tempVal);
                continue; // Skip if temp is not a number
            }
            
            // Handle ROR (can be null/undefined or non-numeric)
            const rorV = (rorVal !== undefined && rorVal !== null && !isNaN(Number(rorVal))) ? Number(rorVal) : null;

            if (tStr) { // Only proceed if time was successfully parsed
                const currentSeconds = timeToSeconds(tStr); // Use potentially fractional seconds here
                
                // Add data point if time is new, or if time is same but temp differs
                if (fileTimes.length === 0 || currentSeconds > timeToSeconds(fileTimes[fileTimes.length - 1]) || (currentSeconds === timeToSeconds(fileTimes[fileTimes.length - 1]) && temps[temps.length-1] !== tempV) ) {
                     fileTimes.push(tStr); 
                     temps.push(tempV); 
                     rors.push(rorV); 
                     if (currentSeconds > maxSec) maxSec = currentSeconds; 
                 } else if (currentSeconds === timeToSeconds(fileTimes[fileTimes.length - 1])) {
                      // If time is exactly the same, overwrite the last point's temp/ROR
                      temps[temps.length - 1] = tempV;
                      rors[rors.length - 1] = rorV;
                 } // Ignore if time goes backward
            }
        } 
        
        if (temps.length === 0) {
            console.warn(`파일 ${file.name} 에서 유효한 데이터를 추출하지 못했습니다.`);
            return null;
        } 

        const keyPts = findKeyPoints(fileTimes, temps, rors); 
        const clr = profileColors[index % profileColors.length]; 
        const fileIdentifier = file.name; // Use original filename as identifier

        // Align data with global labels (essential for category axis)
        const globalLabels = roastingChart.data.labels;
        const fullTemps = new Array(globalLabels.length).fill(null);
        const fullRors = new Array(globalLabels.length).fill(null);
        
        fileTimes.forEach((t, dataIndex) => {
            const labelIndex = findLabelIndex(t); // Find where this time fits in global labels
            if (labelIndex !== -1) {
                // Handle potential duplicate time entries in source data mapping to the same label index
                // Only update if the slot is null, or potentially average/overwrite based on logic
                if (fullTemps[labelIndex] === null) { 
                    fullTemps[labelIndex] = temps[dataIndex];
                    fullRors[labelIndex] = rors[dataIndex];
                } else {
                    // Optional: Handle duplicates - e.g., average or log a warning
                    // console.warn(`Duplicate time ${t} mapping to index ${labelIndex}. Using first value.`);
                }
            }
        });
        
        // Create Datasets
        const tempDs = { 
            label: `온도 (${file.name})`, fileIdentifier: fileIdentifier, yAxisID: 'temp', 
            data: fullTemps, borderColor: clr, backgroundColor: 'transparent', 
            borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, hidden: false, spanGaps: true // Connect lines across null points
        }; 
        const rorDs = { 
            label: `ROR (${file.name})`, fileIdentifier: fileIdentifier, yAxisID: 'ror', 
            data: fullRors, borderColor: clr, backgroundColor: 'transparent', 
            borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
            tension: 0.1, hidden: false, spanGaps: true 
        }; 

        // Store original styles for legend hover effect
        originalDatasetStyles[tempDs.label] = { borderWidth: tempDs.borderWidth, borderColor: tempDs.borderColor };
        originalDatasetStyles[rorDs.label] = { borderWidth: rorDs.borderWidth, borderColor: rorDs.borderColor };

        return { 
            fileName: file.name, // Keep original name for display
            fileIdentifier: fileIdentifier, // Identifier for internal use
            tempDataset: tempDs, rorDataset: rorDs, 
            keyPoints: keyPts, color: clr, maxSeconds: maxSec 
        };
    } catch (err) { 
        console.error(`파일 처리 오류 ${file.name}:`, err); 
        alert(`파일 읽기/처리 오류: ${file.name}\n${err.message}\n콘솔에서 상세 내용을 확인하세요.`); 
        return null; 
    }
} // --- END of processExcelFile ---

// --- Legend Hover Handlers ---
function handleLegendHover(evt, item, legend) {
    // (This function logic remains the same)
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
    // (This function logic remains the same)
     if (!roastingChart || !item) return;
     legend.chart.data.datasets.forEach((dataset, index) => {
         const meta = legend.chart.getDatasetMeta(index);
         if (meta.hidden) return; 
         if (originalDatasetStyles[dataset.label]) {
             dataset.borderWidth = originalDatasetStyles[dataset.label].borderWidth;
             dataset.borderColor = originalDatasetStyles[dataset.label].borderColor;
         } else {
             // Fallback might be needed if styles weren't stored correctly
             dataset.borderWidth = 1.5; // Default back
             // Re-guess color based on index (less reliable)
             // const colorIndex = legend.chart.data.datasets.filter(ds => ds.fileIdentifier === dataset.fileIdentifier && ds.label.includes('온도'))[0]; 
             // Need a better way to map back to color if style object fails
         }
     });
     legend.chart.update('none'); 
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
        checkboxContainer.innerHTML = ''; 
        if (roastingChart) {
             roastingChart.data.labels = [];
             roastingChart.data.datasets = [];
             roastingChart.options.plugins.annotation.annotations = {};
             Object.keys(originalDatasetStyles).forEach(key => delete originalDatasetStyles[key]); 
        } else {
             initChart(); 
        }
        maxTimeSecondsOverall = 0; 
        
        // --- Process Files ---
        const sortedFiles = sortFiles(files);
        const fileReadPromises = sortedFiles.map(file => 
            new Promise((resolve, reject) => { 
                const reader = new FileReader(); 
                reader.onload = (event) => resolve({ file: file, data: event.target.result }); 
                reader.onerror = (err) => reject({ file: file, error: err }); 
                reader.readAsArrayBuffer(file); 
            })
        );

        Promise.all(fileReadPromises).then(results => {
            // --- First Pass: Determine Max Time ---
            const fileContents = []; // Store file objects and their data
            results.forEach((result, index) => {
                 if (result.data) {
                    // Quick check for max time - Reuse part of processExcelFile logic if needed, or just estimate
                    // For simplicity, we'll calculate max time accurately in the second pass now
                    fileContents.push({ file: result.file, data: result.data, index: index });
                 } else if (result.error) {
                     console.error(`파일 읽기 오류 ${result.file.name}:`, result.error);
                     alert(`파일 읽기 오류: ${result.file.name}`);
                 }
            });

            if (fileContents.length === 0) {
                 alert("선택된 파일을 읽을 수 없습니다.");
                 roastingChart.update(); 
                 return;
            }
            
            // --- Second Pass: Process Data Fully and Add to Chart ---
            const finalValidResults = [];
             fileContents.forEach(item => {
                 // Temporarily process just to find max time for this file
                 const tempResult = processExcelFile(item.file, item.index, item.data);
                 if (tempResult && tempResult.maxSeconds > maxTimeSecondsOverall) {
                      maxTimeSecondsOverall = tempResult.maxSeconds;
                 }
                 // We will re-process later after setting labels, store temp result for now
                 // Or, ideally, refactor processExcelFile to return maxSeconds without full dataset creation first.
                 // For now, we accept the inefficiency of processing twice.
             });

            const xAxisPaddingSeconds = 30; // Add padding to x-axis
            const actualMaxSecs = maxTimeSecondsOverall + xAxisPaddingSeconds; 
            roastingChart.data.labels = generateTimeLabels(actualMaxSecs); // Generate labels based on overall max time
            console.log(`X축 레이블 생성 완료: ${secondsToTime(actualMaxSecs)} 까지 (${roastingChart.data.labels.length}개)`);

            // Now process fully and add to chart
            fileContents.forEach(item => {
                 const result = processExcelFile(item.file, item.index, item.data); // Process again with correct labels context
                 if (result) {
                     finalValidResults.push(result);
                 }
            });

            if (finalValidResults.length === 0) {
                 alert("선택된 파일에서 유효한 로스팅 데이터를 찾을 수 없습니다.");
                 roastingChart.update(); 
                 return; 
            }

            const totalValidFiles = finalValidResults.length;
            finalValidResults.forEach((result, validIndex) => {
                 // Add datasets first
                roastingChart.data.datasets.push(result.tempDataset);
                roastingChart.data.datasets.push(result.rorDataset);
                
                // Create checkbox (pass original file object and identifier)
                createCheckbox(result, result.fileIdentifier, result.color); 
            });

            // Update Chart Once After Adding Datasets (important for annotation positioning)
            roastingChart.update(); 

            // Add Annotations (Now that chartArea is likely calculated)
            finalValidResults.forEach((result, validIndex) => {
                 const fileId = result.fileIdentifier; // Use the identifier
                if (result.keyPoints.tp) addKeyPointAnnotation('tp', result.keyPoints.tp, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.y) addKeyPointAnnotation('y', result.keyPoints.y, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.first) addKeyPointAnnotation('first', result.keyPoints.first, validIndex, totalValidFiles, result.color, fileId);
                if (result.keyPoints.out) addKeyPointAnnotation('out', result.keyPoints.out, validIndex, totalValidFiles, result.color, fileId);
            });

            console.log("차트 업데이트 (주석 포함).");
            roastingChart.update(); // Final update with annotations

        }).catch(errorInfo => { 
            console.error("파일 처리 중 오류 발생:", errorInfo); 
            alert(`파일 처리 중 오류:\n${errorInfo.file?.name || '알 수 없는 파일'}\n${errorInfo.error || '알 수 없는 오류'}`); 
            roastingChart.update();
        });
        
        fileInput.value = ''; // Clear the input after processing
    });
});
// --- END OF FILE script.js ---
