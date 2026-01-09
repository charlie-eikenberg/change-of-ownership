/**
 * Linear API Integration for CHOW Action Plan Generator
 */

const LinearIntegration = (function() {
    const STORAGE_KEY = 'chow-linear-settings';
    const LINEAR_API_URL = 'https://api.linear.app/graphql';

    let settings = {
        apiKey: '',
        teamId: '',
        teamName: '',
        projectId: '',
        projectName: ''
    };

    // Load settings from localStorage
    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                settings = JSON.parse(saved);
                return true;
            } catch (e) {
                console.error('Error loading Linear settings:', e);
            }
        }
        return false;
    }

    // Save settings to localStorage
    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    // Clear settings
    function clearSettings() {
        settings = {
            apiKey: '',
            teamId: '',
            teamName: '',
            projectId: '',
            projectName: ''
        };
        localStorage.removeItem(STORAGE_KEY);
    }

    // Make GraphQL request to Linear API
    async function graphqlRequest(query, variables = {}) {
        const response = await fetch(LINEAR_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': settings.apiKey
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.errors) {
            throw new Error(result.errors[0].message);
        }

        return result.data;
    }

    // Test API key and fetch teams
    async function testConnection(apiKey) {
        settings.apiKey = apiKey;

        const query = `
            query {
                teams {
                    nodes {
                        id
                        name
                    }
                }
            }
        `;

        const data = await graphqlRequest(query);
        return data.teams.nodes;
    }

    // Fetch projects for a team
    async function fetchProjects(teamId) {
        const query = `
            query($teamId: String!) {
                team(id: $teamId) {
                    projects {
                        nodes {
                            id
                            name
                        }
                    }
                }
            }
        `;

        const data = await graphqlRequest(query, { teamId });
        return data.team.projects.nodes;
    }

    // Create an issue in Linear
    async function createIssue(title, description, options = {}) {
        const query = `
            mutation($input: IssueCreateInput!) {
                issueCreate(input: $input) {
                    success
                    issue {
                        id
                        identifier
                        url
                    }
                }
            }
        `;

        const input = {
            teamId: settings.teamId,
            title: title,
            description: description
        };

        if (options.priority) {
            input.priority = options.priority;
        }
        if (options.assigneeId) {
            input.assigneeId = options.assigneeId;
        }
        if (options.stateId) {
            input.stateId = options.stateId;
        }
        if (settings.projectId) {
            input.projectId = settings.projectId;
        }

        const data = await graphqlRequest(query, { input });

        if (!data.issueCreate.success) {
            throw new Error('Failed to create issue');
        }

        return data.issueCreate.issue;
    }

    // Fetch team members
    async function fetchTeamMembers(teamId) {
        const query = `
            query($teamId: String!) {
                team(id: $teamId) {
                    members {
                        nodes {
                            id
                            name
                            displayName
                        }
                    }
                }
            }
        `;

        const data = await graphqlRequest(query, { teamId });
        return data.team.members.nodes;
    }

    // Fetch workflow states for a team
    async function fetchWorkflowStates(teamId) {
        const query = `
            query($teamId: String!) {
                team(id: $teamId) {
                    states {
                        nodes {
                            id
                            name
                            type
                        }
                    }
                }
            }
        `;

        const data = await graphqlRequest(query, { teamId });
        return data.team.states.nodes;
    }

    // Check if connected
    function isConnected() {
        return settings.apiKey && settings.teamId;
    }

    // Get current settings
    function getSettings() {
        return { ...settings };
    }

    // Update settings
    function updateSettings(newSettings) {
        settings = { ...settings, ...newSettings };
        saveSettings();
    }

    // Initialize
    loadSettings();

    return {
        loadSettings,
        saveSettings,
        clearSettings,
        testConnection,
        fetchProjects,
        fetchTeamMembers,
        fetchWorkflowStates,
        createIssue,
        isConnected,
        getSettings,
        updateSettings
    };
})();

// UI Controller for Linear Settings Modal
document.addEventListener('DOMContentLoaded', function() {
    const openBtn = document.getElementById('openLinearSettings');
    const closeBtn = document.getElementById('closeLinearSettings');
    const modal = document.getElementById('linearSettingsModal');
    const apiKeyInput = document.getElementById('linearApiKey');
    const teamSelect = document.getElementById('linearTeam');
    const projectSelect = document.getElementById('linearProject');
    const teamGroup = document.getElementById('teamSelectGroup');
    const projectGroup = document.getElementById('projectSelectGroup');
    const statusDiv = document.getElementById('linearStatus');
    const saveBtn = document.getElementById('saveLinearSettings');
    const disconnectBtn = document.getElementById('disconnectLinear');
    const connectionStatus = document.getElementById('linearConnectionStatus');

    let teams = [];
    let projects = [];

    // Update connection status display
    function updateConnectionDisplay() {
        if (LinearIntegration.isConnected()) {
            const settings = LinearIntegration.getSettings();
            connectionStatus.textContent = `Connected: ${settings.teamName}`;
            openBtn.classList.add('connected');
            disconnectBtn.style.display = 'block';
            saveBtn.textContent = 'Update Settings';
        } else {
            connectionStatus.textContent = 'Connect Linear';
            openBtn.classList.remove('connected');
            disconnectBtn.style.display = 'none';
            saveBtn.textContent = 'Connect to Linear';
        }
    }

    // Open modal
    openBtn.addEventListener('click', function() {
        modal.classList.add('show');

        // Pre-fill if we have settings
        const settings = LinearIntegration.getSettings();
        if (settings.apiKey) {
            apiKeyInput.value = settings.apiKey;
            loadTeamsFromKey(settings.apiKey);
        }
    });

    // Close modal
    closeBtn.addEventListener('click', function() {
        modal.classList.remove('show');
    });

    // Click outside to close
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // API key input - test on blur or paste
    apiKeyInput.addEventListener('blur', async function() {
        const key = apiKeyInput.value.trim();
        if (key && key.startsWith('lin_api_')) {
            await loadTeamsFromKey(key);
        }
    });

    apiKeyInput.addEventListener('paste', function() {
        setTimeout(async () => {
            const key = apiKeyInput.value.trim();
            if (key && key.startsWith('lin_api_')) {
                await loadTeamsFromKey(key);
            }
        }, 100);
    });

    async function loadTeamsFromKey(key) {
        statusDiv.textContent = 'Connecting to Linear...';
        statusDiv.className = 'linear-status loading';

        try {
            teams = await LinearIntegration.testConnection(key);

            if (teams.length === 0) {
                statusDiv.textContent = 'No teams found. Check your API key permissions.';
                statusDiv.className = 'linear-status error';
                return;
            }

            // Populate team dropdown
            teamSelect.innerHTML = '<option value="">Select a team</option>';
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });

            // Pre-select if we have a saved team
            const settings = LinearIntegration.getSettings();
            if (settings.teamId) {
                teamSelect.value = settings.teamId;
                await loadProjectsForTeam(settings.teamId);
            }

            teamGroup.style.display = 'block';
            statusDiv.textContent = 'Connected! Select a team.';
            statusDiv.className = 'linear-status success';

        } catch (error) {
            statusDiv.textContent = 'Connection failed: ' + error.message;
            statusDiv.className = 'linear-status error';
            teamGroup.style.display = 'none';
            projectGroup.style.display = 'none';
        }
    }

    // Team selection
    teamSelect.addEventListener('change', async function() {
        const teamId = teamSelect.value;
        if (teamId) {
            await loadProjectsForTeam(teamId);
        } else {
            projectGroup.style.display = 'none';
        }
    });

    async function loadProjectsForTeam(teamId) {
        try {
            projects = await LinearIntegration.fetchProjects(teamId);

            projectSelect.innerHTML = '<option value="">No project</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectSelect.appendChild(option);
            });

            // Pre-select if we have a saved project
            const settings = LinearIntegration.getSettings();
            if (settings.projectId) {
                projectSelect.value = settings.projectId;
            }

            projectGroup.style.display = 'block';
        } catch (error) {
            console.error('Error loading projects:', error);
            projectGroup.style.display = 'none';
        }
    }

    // Save settings
    saveBtn.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        const teamId = teamSelect.value;
        const projectId = projectSelect.value;

        if (!apiKey || !teamId) {
            statusDiv.textContent = 'Please enter an API key and select a team.';
            statusDiv.className = 'linear-status error';
            return;
        }

        const selectedTeam = teams.find(t => t.id === teamId);
        const selectedProject = projects.find(p => p.id === projectId);

        LinearIntegration.updateSettings({
            apiKey: apiKey,
            teamId: teamId,
            teamName: selectedTeam ? selectedTeam.name : '',
            projectId: projectId || '',
            projectName: selectedProject ? selectedProject.name : ''
        });

        statusDiv.textContent = 'Settings saved!';
        statusDiv.className = 'linear-status success';

        updateConnectionDisplay();

        setTimeout(() => {
            modal.classList.remove('show');
        }, 1000);
    });

    // Disconnect
    disconnectBtn.addEventListener('click', function() {
        LinearIntegration.clearSettings();
        apiKeyInput.value = '';
        teamSelect.innerHTML = '<option value="">Loading teams...</option>';
        projectSelect.innerHTML = '<option value="">No project</option>';
        teamGroup.style.display = 'none';
        projectGroup.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = 'linear-status';
        updateConnectionDisplay();
    });

    // Initialize display
    updateConnectionDisplay();

    // Create Issue Modal elements
    const createIssueModal = document.getElementById('createIssueModal');
    const closeCreateIssueBtn = document.getElementById('closeCreateIssue');
    const cancelCreateIssueBtn = document.getElementById('cancelCreateIssue');
    const confirmCreateIssueBtn = document.getElementById('confirmCreateIssue');
    const issueTitleInput = document.getElementById('issueTitle');
    const issuePrioritySelect = document.getElementById('issuePriority');
    const issueAssigneeSelect = document.getElementById('issueAssignee');
    const issueStatusSelect = document.getElementById('issueStatus');
    const createIssueStatus = document.getElementById('createIssueStatus');

    // Close create issue modal
    function closeCreateIssueModal() {
        createIssueModal.classList.remove('show');
        createIssueStatus.textContent = '';
        createIssueStatus.className = 'linear-status';
    }

    if (closeCreateIssueBtn) {
        closeCreateIssueBtn.addEventListener('click', closeCreateIssueModal);
    }
    if (cancelCreateIssueBtn) {
        cancelCreateIssueBtn.addEventListener('click', closeCreateIssueModal);
    }
    if (createIssueModal) {
        createIssueModal.addEventListener('click', function(e) {
            if (e.target === createIssueModal) {
                closeCreateIssueModal();
            }
        });
    }

    // Handle single Linear issue creation button
    const createLinearBtn = document.getElementById('createLinearIssue');
    if (createLinearBtn) {
        createLinearBtn.addEventListener('click', async function() {
            // Check if connected to Linear
            if (!LinearIntegration.isConnected()) {
                modal.classList.add('show');
                return;
            }

            // Check if there's content to create
            if (!window.currentLinearMarkdown) {
                const toast = document.getElementById('toast');
                toast.textContent = 'Generate an action plan first';
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
                return;
            }

            // Pre-fill title
            const oldOwner = document.getElementById('oldOwnerName')?.value || 'Unknown';
            const newOwner = document.getElementById('newOwnerName')?.value || 'Unknown';
            issueTitleInput.value = `CHOW: ${oldOwner} → ${newOwner}`;

            // Load team members and workflow states
            const settings = LinearIntegration.getSettings();

            createIssueStatus.textContent = 'Loading options...';
            createIssueStatus.className = 'linear-status loading';

            try {
                // Fetch members and states in parallel
                const [members, states] = await Promise.all([
                    LinearIntegration.fetchTeamMembers(settings.teamId),
                    LinearIntegration.fetchWorkflowStates(settings.teamId)
                ]);

                // Populate assignee dropdown
                issueAssigneeSelect.innerHTML = '<option value="">Unassigned</option>';
                members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = member.displayName || member.name;
                    issueAssigneeSelect.appendChild(option);
                });

                // Populate status dropdown (sort by type for logical order)
                const stateOrder = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
                states.sort((a, b) => stateOrder.indexOf(a.type) - stateOrder.indexOf(b.type));

                issueStatusSelect.innerHTML = '<option value="">Default</option>';
                states.forEach(state => {
                    const option = document.createElement('option');
                    option.value = state.id;
                    option.textContent = state.name;
                    issueStatusSelect.appendChild(option);
                });

                createIssueStatus.textContent = '';
                createIssueStatus.className = 'linear-status';

            } catch (error) {
                console.error('Error loading options:', error);
                createIssueStatus.textContent = 'Could not load all options';
                createIssueStatus.className = 'linear-status error';
            }

            // Show the modal
            createIssueModal.classList.add('show');
        });
    }

    // Confirm create issue
    if (confirmCreateIssueBtn) {
        confirmCreateIssueBtn.addEventListener('click', async function() {
            const title = issueTitleInput.value.trim();
            if (!title) {
                createIssueStatus.textContent = 'Please enter a title';
                createIssueStatus.className = 'linear-status error';
                return;
            }

            confirmCreateIssueBtn.textContent = 'Creating...';
            confirmCreateIssueBtn.disabled = true;

            try {
                const options = {};

                if (issuePrioritySelect.value) {
                    options.priority = parseInt(issuePrioritySelect.value);
                }
                if (issueAssigneeSelect.value) {
                    options.assigneeId = issueAssigneeSelect.value;
                }
                if (issueStatusSelect.value) {
                    options.stateId = issueStatusSelect.value;
                }

                const issue = await LinearIntegration.createIssue(
                    title,
                    window.currentLinearMarkdown,
                    options
                );

                closeCreateIssueModal();

                // Update the + Linear button
                const createLinearBtn = document.getElementById('createLinearIssue');
                createLinearBtn.textContent = 'Created!';
                createLinearBtn.classList.add('created');
                setTimeout(() => {
                    createLinearBtn.textContent = '+ Linear';
                    createLinearBtn.classList.remove('created');
                }, 2000);

                // Show toast with link
                const toast = document.getElementById('toast');
                toast.innerHTML = `Created: <a href="${issue.url}" target="_blank">${issue.identifier}</a>`;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 4000);

            } catch (error) {
                console.error('Error creating issue:', error);
                createIssueStatus.textContent = 'Error: ' + error.message;
                createIssueStatus.className = 'linear-status error';
            } finally {
                confirmCreateIssueBtn.textContent = 'Create Issue';
                confirmCreateIssueBtn.disabled = false;
            }
        });
    }
});
