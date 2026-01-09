/**
 * CHOW Action Plan Generator - UI Application
 */

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('chow-form');
    const outputSection = document.getElementById('outputSection');
    const clearBtn = document.getElementById('clearForm');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const acquisitionDateInput = document.getElementById('acquisitionDate');
    const timingIndicator = document.getElementById('timingIndicator');
    const toast = document.getElementById('toast');

    window.currentLinearMarkdown = ''; // Store full markdown (exposed globally for Linear integration)
    window.stageMarkdown = {}; // Store markdown for each stage (exposed globally for Linear integration)

    // Update timing indicator when date changes
    acquisitionDateInput.addEventListener('change', function() {
        updateTimingIndicator();
    });

    function updateTimingIndicator() {
        const date = acquisitionDateInput.value;
        if (!date) {
            timingIndicator.textContent = '';
            timingIndicator.className = 'helper-text';
            return;
        }

        const timing = DecisionEngine.getTiming(date);
        if (timing === 'past') {
            timingIndicator.textContent = 'This CHOW is in the PAST';
            timingIndicator.className = 'helper-text past';
        } else {
            timingIndicator.textContent = 'This CHOW is in the FUTURE';
            timingIndicator.className = 'helper-text future';
        }
    }

    // Form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Gather all inputs
        const inputs = {
            oldOwnerName: document.getElementById('oldOwnerName').value.trim(),
            newOwnerName: document.getElementById('newOwnerName').value.trim(),
            affectedFacilities: document.getElementById('affectedFacilities').value.trim(),
            newFacilityNames: document.getElementById('newFacilityNames').value.trim(),
            newOwnerContact: document.getElementById('newOwnerContact').value.trim(),
            acquisitionDate: document.getElementById('acquisitionDate').value,
            saleType: document.getElementById('saleType').value,
            contractSigned: document.getElementById('contractSigned').value,
            outstandingAR: document.getElementById('outstandingAR').value,
            futureBookedShifts: document.getElementById('futureBookedShifts').value,
            financialDistress: document.getElementById('financialDistress').value,
            willingnessToPay: document.getElementById('willingnessToPay').value,
            blacklisted: document.getElementById('blacklisted').value,
            badDebt: document.getElementById('badDebt').value
        };

        // Process through decision engine
        const result = DecisionEngine.process(inputs);

        // Store markdown for copy
        window.currentLinearMarkdown = result.linearMarkdown;
        window.stageMarkdown = result.stageMarkdown;

        // Render output
        renderOutput(result);

        // Show output section
        outputSection.style.display = 'block';

        // Scroll to output
        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Save form state
        saveFormState(inputs);
    });

    // Render the output
    function renderOutput(result) {
        // Risk card
        const riskCard = document.getElementById('riskCard');
        riskCard.className = 'risk-card ' + result.risk.level;

        document.getElementById('riskLevel').textContent = result.risk.level.toUpperCase() + ' RISK';
        document.getElementById('scenario').textContent = result.scenario;
        document.getElementById('keyFocus').textContent = result.keyFocus;

        // Priority actions with confidence info icons
        const priorityList = document.getElementById('priorityList');
        priorityList.innerHTML = '';
        result.priorityActions.forEach(action => {
            const li = document.createElement('li');

            // Generate tooltip content based on confidence level
            let tooltipContent = '';
            if (action.confidence === 'high') {
                tooltipContent = 'High confidence: This is a standard response for this scenario. Follow this action.';
            } else if (action.confidence === 'medium') {
                tooltipContent = 'Medium confidence: This is a reasonable approach, but context matters. Use your judgment based on the specific situation.';
            } else {
                tooltipContent = 'Low confidence: This is an unusual scenario with multiple valid approaches. Consider escalating to Louis Case or Charlie Eikenberg for guidance.';
            }

            li.innerHTML = `
                <span class="action-text">${action.text}</span>
                <span class="info-icon" data-confidence="${action.confidence}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        <text x="8" y="12" text-anchor="middle" font-size="10" font-weight="bold">i</text>
                    </svg>
                    <span class="tooltip">${tooltipContent}</span>
                </span>
            `;
            priorityList.appendChild(li);
        });

        // Staged checklist
        renderStage('stage1', result.checklist.stage1);
        renderStage('stage2', result.checklist.stage2);
        renderStage('stage3', result.checklist.stage3);
        renderStage('stage4', result.checklist.stage4);

        // Special alerts
        const alertsSection = document.getElementById('specialAlerts');
        const alertsList = document.getElementById('alertsList');

        if (result.alerts.length > 0) {
            alertsSection.style.display = 'block';
            alertsList.innerHTML = '';
            result.alerts.forEach(alert => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${alert.type.toUpperCase()}:</strong> ${alert.text}`;
                alertsList.appendChild(li);
            });
        } else {
            alertsSection.style.display = 'none';
        }
    }

    function renderStage(stageId, tasks) {
        const stage = document.getElementById(stageId);
        const ul = stage.querySelector('.checklist');
        ul.innerHTML = '';

        if (tasks.length === 0) {
            stage.style.display = 'none';
            return;
        }

        stage.style.display = 'block';

        tasks.forEach(task => {
            const li = document.createElement('li');
            if (task.completed) {
                li.classList.add('completed');
            }

            let html = '';

            // Add label if present
            if (task.label) {
                html += `<span class="task-label ${task.label}">${task.label}</span>`;
            }

            html += task.text;

            if (task.note) {
                html += ` <em style="color: #64748b; font-size: 13px;">(${task.note})</em>`;
            }

            li.innerHTML = html;
            ul.appendChild(li);
        });
    }

    // Copy all to clipboard
    copyAllBtn.addEventListener('click', async function() {
        await copyToClipboard(window.currentLinearMarkdown);
        showToast('Copied all to clipboard!');
    });

    // Per-stage copy buttons
    document.addEventListener('click', async function(e) {
        if (e.target.classList.contains('btn-copy-stage')) {
            const stage = e.target.dataset.stage;
            if (window.stageMarkdown[stage]) {
                await copyToClipboard(window.stageMarkdown[stage]);

                // Visual feedback
                e.target.textContent = 'Copied!';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = 'Copy';
                    e.target.classList.remove('copied');
                }, 1500);

                showToast(`Stage copied to clipboard!`);
            }
        }
    });

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    // Clear form
    clearBtn.addEventListener('click', function() {
        form.reset();
        outputSection.style.display = 'none';
        timingIndicator.textContent = '';
        timingIndicator.className = 'helper-text';
        localStorage.removeItem('chow-form-state');
    });

    // Save form state to localStorage
    function saveFormState(inputs) {
        localStorage.setItem('chow-form-state', JSON.stringify(inputs));
    }

    // Restore form state from localStorage
    function restoreFormState() {
        const saved = localStorage.getItem('chow-form-state');
        if (!saved) return;

        try {
            const inputs = JSON.parse(saved);

            document.getElementById('oldOwnerName').value = inputs.oldOwnerName || '';
            document.getElementById('newOwnerName').value = inputs.newOwnerName || '';
            document.getElementById('affectedFacilities').value = inputs.affectedFacilities || '';
            document.getElementById('newFacilityNames').value = inputs.newFacilityNames || '';
            document.getElementById('newOwnerContact').value = inputs.newOwnerContact || '';
            document.getElementById('acquisitionDate').value = inputs.acquisitionDate || '';
            document.getElementById('saleType').value = inputs.saleType || '';
            document.getElementById('contractSigned').value = inputs.contractSigned || '';
            document.getElementById('outstandingAR').value = inputs.outstandingAR || '';
            document.getElementById('futureBookedShifts').value = inputs.futureBookedShifts || '';
            document.getElementById('financialDistress').value = inputs.financialDistress || 'unknown';
            document.getElementById('willingnessToPay').value = inputs.willingnessToPay || 'unknown';
            document.getElementById('blacklisted').value = inputs.blacklisted || 'none';
            document.getElementById('badDebt').value = inputs.badDebt || 'no';

            updateTimingIndicator();
        } catch (e) {
            console.error('Error restoring form state:', e);
        }
    }

    // Initialize
    restoreFormState();
});
