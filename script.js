document.addEventListener('DOMContentLoaded', function() {
    const titleWrapper = document.querySelector('.terminal-title');
    const title = document.querySelector('.terminal-title .underline-text');
    const description = document.querySelector('.terminal-description');
    let typingCompleted = false;
    
    if (title && description && titleWrapper) {
        const originalTitle = title.textContent;
        const originalDescription = description.textContent;

        function runTypingAnimation() {
            if (typingCompleted) return;

            title.textContent = '';
            description.textContent = '';

            titleWrapper.classList.add('typing-cursor');

            let titleIndex = 0;
            function typeTitle() {
                if (titleIndex < originalTitle.length) {
                    title.textContent += originalTitle.charAt(titleIndex);
                    titleIndex++;
                    setTimeout(typeTitle, 100);
                } else {
                    titleWrapper.classList.remove('typing-cursor');
                    description.classList.add('typing-cursor');
                    setTimeout(typeDescription, 500);
                }
            }

            let descIndex = 0;
            function typeDescription() {
                if (descIndex < originalDescription.length) {
                    description.textContent += originalDescription.charAt(descIndex);
                    descIndex++;
                    setTimeout(typeDescription, 50);
                } else {
                    typingCompleted = true;
                }
            }

            setTimeout(typeTitle, 500);
        }

        runTypingAnimation();
    }
    
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            const targetPage = this.getAttribute('data-page');
            
            navLinks.forEach(nav => nav.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(targetPage + '-page').classList.add('active');
        });
    });
    
    const socialLinks = document.querySelectorAll('.social-link');
    let currentIndex = -1;
    let selectedIndex = -1;
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown' || e.key === 'Tab') {
            e.preventDefault();
            currentIndex = (currentIndex + 1) % socialLinks.length;
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentIndex = currentIndex <= 0 ? socialLinks.length - 1 : currentIndex - 1;
            updateSelection();
        } else if (e.key === 'Enter' && currentIndex >= 0) {
            e.preventDefault();
            selectedIndex = currentIndex;
            updateSelection();
            setTimeout(() => {
                socialLinks[currentIndex].click();
            }, 100);
        }
    });
    
    socialLinks.forEach((link, index) => {
        link.addEventListener('click', function(e) {
            selectedIndex = index;
            updateSelection();
        });
    });
    
    function updateSelection() {
        socialLinks.forEach((link, index) => {
            if (index === currentIndex || index === selectedIndex) {
                link.classList.add('selected');
            } else {
                link.classList.remove('selected');
            }
        });
    }
    
    socialLinks.forEach((link, index) => {
        link.addEventListener('mouseenter', () => {
            if (selectedIndex !== index) {
                currentIndex = -1;
                updateSelection();
            }
        });
    });
});

let activitiesCache = [];
let lastScheduledEnd = null;
let ws = null;
let heartbeatInterval = null;
const USER_ID = '745203026335236178';

function connectToLanyard() {
    showLoadingSpinner();
    
    try {
        ws = new WebSocket('wss://api.lanyard.rest/socket');
        
        ws.onopen = function() {
            console.log('Connected to Lanyard WebSocket');
            updateLoadingText('retrieving activity data...');
        };
        
        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };
        
        ws.onclose = function(event) {
            console.log('Lanyard WebSocket connection closed:', event.code, event.reason);
            showLoadingSpinner();
            updateLoadingText('reconnecting...');
            // Reconnect after 5 seconds
            setTimeout(connectToLanyard, 5000);
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        };
        
        ws.onerror = function(error) {
            console.error('Lanyard WebSocket error:', error);
            updateLoadingText('connection failed, retrying...');
        };
    } catch (error) {
        console.error('Failed to connect to Lanyard WebSocket:', error);
        // Fallback to REST API
        setTimeout(fetchDiscordActivityREST, 1000);
    }
}

function handleWebSocketMessage(message) {
    console.log('Received WebSocket message:', message);
    
    switch (message.op) {
        case 1: // Hello
            const heartbeatIntervalMs = message.d.heartbeat_interval;
            console.log('Starting heartbeat with interval:', heartbeatIntervalMs);
            startHeartbeat(heartbeatIntervalMs);
            sendInitialize();
            break;
            
        case 0: // Event
            if (message.t === 'INIT_STATE') {
                console.log('Received INIT_STATE:', message.d);
                // For single user subscription, the data is directly in message.d
                updatePresence(message.d);
            } else if (message.t === 'PRESENCE_UPDATE') {
                console.log('Received PRESENCE_UPDATE:', message.d);
                updatePresence(message.d);
            }
            break;
    }
}

function startHeartbeat(intervalMs) {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 3 }));
        }
    }, intervalMs);
}

function sendInitialize() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const initMessage = {
            op: 2,
            d: {
                subscribe_to_id: USER_ID
            }
        };
        console.log('Sending initialize message:', initMessage);
        ws.send(JSON.stringify(initMessage));
    }
}

function updatePresence(presenceData) {
    console.log('Updating presence with data:', presenceData);
    const activities = presenceData.activities || [];
    console.log('Extracted activities:', activities);
    activitiesCache = activities;
    lastScheduledEnd = null;
    hideLoadingSpinner();
    renderActivities(activities);
}

function showLoadingSpinner() {
    const loadingElement = document.getElementById('activity-loading');
    const activityDetails = document.getElementById('activity-details');
    const activityExtras = document.getElementById('activity-extras');
    
    if (loadingElement) loadingElement.style.display = 'flex';
    if (activityDetails) activityDetails.style.display = 'none';
    if (activityExtras) activityExtras.style.display = 'none';
}

function hideLoadingSpinner() {
    const loadingElement = document.getElementById('activity-loading');
    if (loadingElement) loadingElement.style.display = 'none';
}

function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) loadingText.textContent = text;
}

// Fallback REST API function
async function fetchDiscordActivityREST() {
    showLoadingSpinner();
    updateLoadingText('loading activity data...');
    
    try {
        const response = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`);
        const data = await response.json();

        if (data.success) {
            const activities = data.data.activities || [];
            activitiesCache = activities;
            lastScheduledEnd = null;
            hideLoadingSpinner();
            renderActivities(activities);
        }
    } catch (error) {
        console.error('Failed to fetch Discord activity:', error);
        updateLoadingText('failed to load activity data');
        setTimeout(() => {
            const activityDetails = document.getElementById('activity-details');
            if (activityDetails) activityDetails.style.display = 'none';
            hideLoadingSpinner();
        }, 2000);
    }
}

function renderActivities(activities) {
    const activityDetails = document.getElementById('activity-details');
    const activityName = document.getElementById('activity-name');
    const activityDescription = document.getElementById('activity-description');
    const activityTime = document.getElementById('activity-time');
    const activityExtras = document.getElementById('activity-extras');
    const extrasToggle = document.getElementById('extras-toggle');
    const extrasList = document.getElementById('extras-list');
    const discordActivity = document.querySelector('.discord-activity');

    if (!activityDetails || !activityName || !activityDescription || !activityTime) return;

    if (!activities || activities.length === 0) {
        activityDetails.style.display = 'none';
        if (activityExtras) activityExtras.style.display = 'none';
        if (discordActivity) discordActivity.style.display = 'none';
        return;
    }

    const primary = activities[0];
    activityName.textContent = primary.name || '';
    let details = [];
    if (primary.details) details.push(primary.details);
    if (primary.state) details.push(primary.state);
    activityDescription.textContent = details.join(' • ');

    const isPrimarySpotify = primary.name && primary.name.toLowerCase().includes('spotify') && primary.timestamps && primary.timestamps.start && primary.timestamps.end;
    if (!isPrimarySpotify) {
        if (primary.timestamps && primary.timestamps.start) {
            const elapsed = Date.now() - primary.timestamps.start;
            activityTime.textContent = `for ${formatElapsedTime(elapsed)}`;
        } else {
            activityTime.textContent = '';
        }
    } else {
        activityTime.textContent = '';
    }

    const activityProgress = document.getElementById('activity-progress');
    const activityProgressFill = document.getElementById('activity-progress-fill');
    if (primary.name && primary.name.toLowerCase().includes('spotify') && primary.timestamps && primary.timestamps.start && primary.timestamps.end) {
        const start = primary.timestamps.start;
        const end = primary.timestamps.end;
        const pct = Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)));
        if (activityProgress && activityProgressFill) {
            activityProgress.style.display = 'block';
            activityProgressFill.style.width = `${pct}%`;
            const curEl = document.getElementById('activity-progress-current');
            const totEl = document.getElementById('activity-progress-total');
            if (curEl) curEl.textContent = formatTimeMMSS(Date.now() - start);
            if (totEl) totEl.textContent = formatTimeMMSS(end - start);
        }
    } else {
        if (activityProgress) activityProgress.style.display = 'none';
    }

    activityDetails.style.display = 'block';
    if (discordActivity) discordActivity.style.display = 'block';

    if (activityExtras && extrasList && extrasToggle) {
        if (activities.length > 1) {
            // Preserve the current expansion state
            const wasOpen = activityExtras.classList.contains('open');
            
            // Clear and rebuild the extras list
            extrasList.innerHTML = '';
            
            for (let i = 1; i < activities.length; i++) {
                const act = activities[i];
                const div = document.createElement('div');
                div.className = 'extras-item';

                const nameEl = document.createElement('div');
                nameEl.className = 'extras-item-name';
                nameEl.textContent = act.name || 'Unknown';

                const descEl = document.createElement('div');
                descEl.className = 'extras-item-desc';
                let sub = [];
                if (act.details) sub.push(act.details);
                if (act.state) sub.push(act.state);
                descEl.textContent = sub.join(' • ');

                const timeEl = document.createElement('div');
                timeEl.className = 'extras-item-time';
                const isExtraSpotify = act.name && act.name.toLowerCase().includes('spotify') && act.timestamps && act.timestamps.start && act.timestamps.end;
                if (!isExtraSpotify && act.timestamps && act.timestamps.start) {
                    timeEl.dataset.start = act.timestamps.start;
                    timeEl.textContent = `for ${formatElapsedTime(Date.now() - act.timestamps.start)}`;
                } else {
                    timeEl.textContent = '';
                }

                div.appendChild(nameEl);
                if (descEl.textContent) div.appendChild(descEl);
                if (timeEl.textContent) div.appendChild(timeEl);

                if (act.name && act.name.toLowerCase().includes('spotify') && act.timestamps && act.timestamps.start && act.timestamps.end) {
                    const extraProgress = document.createElement('div');
                    extraProgress.className = 'progress-bar';
                    extraProgress.style.marginTop = '6px';
                    const extraFill = document.createElement('div');
                    extraFill.className = 'progress-fill';
                    const pct = Math.max(0, Math.min(100, Math.round(((Date.now() - act.timestamps.start) / (act.timestamps.end - act.timestamps.start)) * 100)));
                    extraFill.style.width = `${pct}%`;
                    extraFill.dataset.start = String(act.timestamps.start);
                    extraFill.dataset.end = String(act.timestamps.end);
                    const extraTimes = document.createElement('div');
                    extraTimes.className = 'progress-times extras-progress-times';
                    const extraCur = document.createElement('span');
                    extraCur.className = 'progress-current';
                    extraCur.textContent = formatTimeMMSS(Date.now() - act.timestamps.start);
                    const extraTot = document.createElement('span');
                    extraTot.className = 'progress-total';
                    extraTot.textContent = formatTimeMMSS(act.timestamps.end - act.timestamps.start);
                    extraTimes.appendChild(extraCur);
                    extraTimes.appendChild(extraTot);
                    extraProgress.appendChild(extraFill);
                    div.appendChild(extraTimes);
                    div.appendChild(extraProgress);
                }

                extrasList.appendChild(div);
            }
            
            // Show the extras section
            activityExtras.style.display = 'block';
            
            // Update button text based on current state
            extrasToggle.textContent = wasOpen ? `- hide activities` : `+ more activities (${activities.length - 1})`;
            
            // Set up the toggle functionality
            extrasToggle.onclick = () => {
                const nowOpen = activityExtras.classList.toggle('open');
                extrasToggle.textContent = nowOpen ? `- hide activities` : `+ more activities (${activities.length - 1})`;
            };
            
            // Restore the previous expansion state
            if (wasOpen) {
                activityExtras.classList.add('open');
            } else {
                activityExtras.classList.remove('open');
            }
        } else {
            activityExtras.style.display = 'none';
        }
    }
}

function formatElapsedTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

function formatTimeMMSS(milliseconds) {
    if (isNaN(milliseconds) || milliseconds < 0) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    const pad = (v) => (v < 10 ? '0' + v : String(v));
    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    connectToLanyard();
    setInterval(() => {
        if (!activitiesCache || activitiesCache.length === 0) return;
        const primary = activitiesCache[0];
        const activityTime = document.getElementById('activity-time');
        const activityName = document.getElementById('activity-name');
        if (primary && activityTime && activityName) {
            const isPrimarySpotify = primary.name && primary.name.toLowerCase().includes('spotify') && primary.timestamps && primary.timestamps.start && primary.timestamps.end;
            if (!isPrimarySpotify) {
                if (primary.timestamps && primary.timestamps.start) {
                    const elapsed = Date.now() - primary.timestamps.start;
                    activityTime.textContent = `for ${formatElapsedTime(elapsed)}`;
                } else {
                    activityTime.textContent = '';
                }
            } else {
                activityTime.textContent = '';
            }
        }
            const activityProgressFill = document.getElementById('activity-progress-fill');
            if (activityProgressFill && activitiesCache[0] && activitiesCache[0].timestamps && activitiesCache[0].timestamps.start && activitiesCache[0].timestamps.end) {
                const s = activitiesCache[0].timestamps.start;
                const e = activitiesCache[0].timestamps.end;
                const pct = Math.max(0, Math.min(100, Math.round(((Date.now() - s) / (e - s)) * 100)));
                activityProgressFill.style.width = `${pct}%`;
                document.getElementById('activity-progress').style.display = 'block';
                const curEl = document.getElementById('activity-progress-current');
                const totEl = document.getElementById('activity-progress-total');
                if (curEl) curEl.textContent = formatTimeMMSS(Date.now() - s);
                if (totEl) totEl.textContent = formatTimeMMSS(e - s);
                if (Date.now() >= e && lastScheduledEnd !== e) {
                    lastScheduledEnd = e;
                    setTimeout(() => {
                        fetchDiscordActivity();
                        lastScheduledEnd = null;
                    }, 2000);
                }
            }
        const activityExtras = document.getElementById('activity-extras');
        if (activityExtras && activityExtras.classList.contains('open')) {
            const timeEls = document.querySelectorAll('.extras-item-time');
            timeEls.forEach(el => {
                const start = parseInt(el.dataset.start, 10);
                if (!isNaN(start)) {
                    el.textContent = `for ${formatElapsedTime(Date.now() - start)}`;
                }
            });
                const extraFills = document.querySelectorAll('.extras-item .progress-fill');
                extraFills.forEach(fill => {
                    const s = parseInt(fill.dataset.start, 10);
                    const e = parseInt(fill.dataset.end, 10);
                    if (!isNaN(s) && !isNaN(e) && e > s) {
                        const pct = Math.max(0, Math.min(100, Math.round(((Date.now() - s) / (e - s)) * 100)));
                        fill.style.width = `${pct}%`;
                        const parent = fill.closest('.extras-item');
                        if (parent) {
                            const times = parent.querySelector('.extras-progress-times');
                            if (times) {
                                const cur = times.querySelector('.progress-current');
                                const tot = times.querySelector('.progress-total');
                                if (cur) cur.textContent = formatTimeMMSS(Date.now() - s);
                                if (tot) tot.textContent = formatTimeMMSS(e - s);
                            }
                        }
                    }
                });
        }
    }, 1000);
});