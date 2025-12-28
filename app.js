import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, setDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1WNyH2I3qjYxZdmwlBghpVyRgFj19UMs",
  authDomain: "grain-broker-5a319.firebaseapp.com",
  projectId: "grain-broker-5a319",
  storageBucket: "grain-broker-5a319.firebasestorage.app",
  messagingSenderId: "918192159128",
  appId: "1:918192159128:web:9fdb960cbf84e30a0e53ed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let bookingsData = [];
let companiesData = [];
let editBookingId = null;
let editCompanyId = null;
let deleteTargetId = null;
let deleteCompanyTargetId = null;
let brokerageChart = null;
let quantityChart = null;
let currentChartPeriod = 'month';
let selectedCompanyFilter = '';
let currentWhatsAppBooking = null;
let templatesData = [];
let editTemplateId = null;
let deleteTemplateTargetId = null;

// --- AUTH LOGIC ---
window.handleLogin = async () => {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('pass').value;
    if(!email || !pass) return alert("Please enter email and password");
    try { await signInWithEmailAndPassword(auth, email, pass); } catch (e) { alert("Login failed: " + e.message); }
};

window.handleSignup = async () => {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    if(!name || !email || !pass) return alert("Please fill mandatory fields");
    try { 
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", userCredential.user.uid), { name, phone, email });
        alert("Account created successfully!"); 
    } catch (e) { alert("Signup Error: " + e.message); }
};

window.handleReset = async () => {
    const email = document.getElementById('reset-email').value.trim();
    if(!email) return alert("Please enter your email");
    try { await sendPasswordResetEmail(auth, email); alert("Reset link sent!"); window.showAuthSubView('login'); } catch (e) { alert(e.message); }
};

window.logout = () => signOut(auth);

window.showAuthSubView = (view) => {
    document.getElementById('login-form').style.display = view === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = view === 'signup' ? 'block' : 'none';
    document.getElementById('forgot-form').style.display = view === 'forgot' ? 'block' : 'none';
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userName = userDoc.exists() ? userDoc.data().name : "Broker";
            document.getElementById('user-name-label').innerText = userName;
        } catch (err) { 
            document.getElementById('user-name-label').innerText = "Broker"; 
        }
        document.getElementById('view-auth').style.display = 'none';
        document.getElementById('app-ui').style.display = 'block';
        window.showView('home');
        loadData();
    } else {
        document.getElementById('view-auth').style.display = 'flex';
        document.getElementById('app-ui').style.display = 'none';
    }
});

// --- NAVIGATION ---
window.showView = (view) => {
    document.querySelectorAll('.page-content').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${view}`);
    if(target) target.style.display = 'block';
    if(view === 'analytics') {
        setTimeout(() => {
            updateCompanyFilterDropdown();
            renderCharts();
        }, 100);
    }
};

// --- DATA LOGIC ---
async function loadData() {
    const user = auth.currentUser;
    if (!user) return;

    // Filter Companies by userId
    const companiesQuery = query(collection(db, "companies"), where("userId", "==", user.uid));
    onSnapshot(companiesQuery, (snap) => {
        companiesData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        updateDropdowns();
        renderCompanies();
        if(document.getElementById('view-analytics').style.display === 'block') {
            updateCompanyFilterDropdown();
        }
    });

    // Filter Bookings by userId
    const bookingsQuery = query(
        collection(db, "bookings"), 
        where("userId", "==", user.uid), 
        orderBy("timestamp", "desc")
    );
    onSnapshot(bookingsQuery, (snap) => {
        bookingsData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderBookings();
        calculateStats();
        if(document.getElementById('view-analytics').style.display === 'block') {
            renderCharts();
        }
    });

    // Filter Templates by userId
    const templatesQuery = query(collection(db, "templates"), where("userId", "==", user.uid));
    onSnapshot(templatesQuery, (snap) => {
        templatesData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderTemplates();
        updateTemplateDropdown();
    });
}

function updateDropdowns() {
    const opts = companiesData.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    document.getElementById('book-from').innerHTML = `<option value="">From Company *</option>` + opts;
    document.getElementById('book-to').innerHTML = `<option value="">To Company *</option>` + opts;
}

function updateCompanyFilterDropdown() {
    const filterSelect = document.getElementById('company-filter');
    if(!filterSelect) return;
    
    const uniqueCompanies = new Set();
    bookingsData.forEach(b => {
        if(b.from) uniqueCompanies.add(b.from);
        if(b.to) uniqueCompanies.add(b.to);
    });
    
    const opts = Array.from(uniqueCompanies).sort().map(c => 
        `<option value="${c}">${c}</option>`
    ).join('');
    
    filterSelect.innerHTML = `<option value="">All Companies</option>` + opts;
    filterSelect.value = selectedCompanyFilter;
}

// --- COMPANY FILTER ---
window.applyCompanyFilter = () => {
    selectedCompanyFilter = document.getElementById('company-filter').value;
    renderCharts();
};

// --- COMPANY OPERATIONS ---
window.saveCompany = async () => {
    const name = document.getElementById('comp-name').value.trim();
    const phone = document.getElementById('comp-phone').value.trim();
    const client = document.getElementById('comp-client').value.trim();
    const state = document.getElementById('comp-state').value;
    if(!name || !phone || !client) return alert("Fill mandatory fields!");
    
    const data = { 
        name, phone, client, state, 
        updatedAt: serverTimestamp(),
        userId: auth.currentUser.uid 
    };
    
    try {
        if(editCompanyId) { 
            await updateDoc(doc(db, "companies", editCompanyId), data); 
        } else { 
            data.createdAt = serverTimestamp(); 
            await addDoc(collection(db, "companies"), data); 
        }
        window.closeCompanyModal();
    } catch(e) { alert(e.message); }
};

window.editCompany = (id) => {
    const c = companiesData.find(x => x.id === id);
    if(!c) return;
    editCompanyId = id;
    document.getElementById('company-modal-title').innerText = "Edit Company";
    document.getElementById('comp-name').value = c.name;
    document.getElementById('comp-phone').value = c.phone;
    document.getElementById('comp-client').value = c.client;
    document.getElementById('comp-state').value = c.state || "";
    document.getElementById('modal-company').style.display = 'flex';
};

window.deleteCompany = (id) => { deleteCompanyTargetId = id; document.getElementById('modal-confirm-company').style.display = 'flex'; };
window.confirmDeleteCompany = async () => {
    if(deleteCompanyTargetId) {
        try { await deleteDoc(doc(db, "companies", deleteCompanyTargetId)); window.closeConfirmCompanyModal(); } catch(e) { alert(e.message); }
    }
};
window.closeConfirmCompanyModal = () => { deleteCompanyTargetId = null; document.getElementById('modal-confirm-company').style.display = 'none'; };

// --- BOOKING OPERATIONS ---
window.saveBooking = async () => {
    const grain = document.getElementById('book-grain').value;
    const qty = parseFloat(document.getElementById('book-qty').value);
    const price = parseFloat(document.getElementById('book-price').value);
    const perc = parseFloat(document.getElementById('book-perc').value);
    const from = document.getElementById('book-from').value;
    const to = document.getElementById('book-to').value;
    if(!grain || isNaN(qty) || isNaN(price) || isNaN(perc) || !from || !to) return alert("Fill mandatory fields!");
    
    const data = { 
        grain, qty, price, perc, 
        brokerage: (qty * price * (perc/100)), 
        from, to, 
        timestamp: serverTimestamp(),
        userId: auth.currentUser.uid
    };

    try {
        if(editBookingId) { 
            await updateDoc(doc(db, "bookings", editBookingId), data); 
        } else { 
            await addDoc(collection(db, "bookings"), data); 
        }
        window.closeBookingModal();
    } catch(e) { alert(e.message); }
};

window.editBooking = (id) => {
    const b = bookingsData.find(x => x.id === id);
    if(!b) return;
    editBookingId = id;
    document.getElementById('booking-modal-title').innerText = "Edit Booking";
    document.getElementById('book-grain').value = b.grain;
    document.getElementById('book-qty').value = b.qty;
    document.getElementById('book-price').value = b.price;
    document.getElementById('book-perc').value = b.perc;
    document.getElementById('book-from').value = b.from;
    document.getElementById('book-to').value = b.to;
    document.getElementById('modal-booking').style.display = 'flex';
};

window.deleteBooking = (id) => { deleteTargetId = id; document.getElementById('modal-confirm').style.display = 'flex'; };
window.confirmDelete = async () => {
    if(deleteTargetId) {
        try { await deleteDoc(doc(db, "bookings", deleteTargetId)); window.closeConfirmModal(); } catch(e) { alert(e.message); }
    }
};
window.closeConfirmModal = () => { deleteTargetId = null; document.getElementById('modal-confirm').style.display = 'none'; };

// --- RENDERING ---
function renderBookings() {
    const container = document.getElementById('bookings-table-container');
    if(bookingsData.length === 0) { container.innerHTML = `<div class="empty-state">No entries found.</div>`; return; }
    let html = `<table><thead><tr><th>Grain</th><th>Qty</th><th>From ➔ To</th><th>Brokerage</th><th>Action</th></tr></thead><tbody>`;
    bookingsData.forEach(b => {
        html += `<tr>
            <td><strong>${b.grain}</strong></td>
            <td>${b.qty} MT</td>
            <td><small>${b.from}<br>➔ ${b.to}</small></td>
            <td>₹${(b.brokerage || 0).toFixed(2)}</td>
            <td>
                <div class="action-links">
                    <button class="action-btn whatsapp-btn" onclick="window.openWhatsAppModal('${b.id}')">📱 WhatsApp</button>
                    <span class="edit-link" onclick="window.editBooking('${b.id}')">Edit</span>
                    <span class="delete-link" onclick="window.deleteBooking('${b.id}')">Delete</span>
                </div>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderCompanies() {
    const list = document.getElementById('companies-list');
    if(companiesData.length === 0) { list.innerHTML = `<div class="empty-state">No companies.</div>`; return; }
    list.innerHTML = companiesData.map(c => `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div><strong>${c.name}</strong> (${c.client})<br><small>📞 ${c.phone}</small></div>
            <div class="action-links"><span class="edit-link" onclick="window.editCompany('${c.id}')">Edit</span><span class="delete-link" onclick="window.deleteCompany('${c.id}')">Delete</span></div>
        </div>
    </div>`).join('');
}

function calculateStats() {
    let b = 0, q = 0;
    bookingsData.forEach(item => { b += (item.brokerage || 0); q += (item.qty || 0); });
    const bStr = `₹${b.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    const qStr = `${q} MT`;
    document.getElementById('home-brokerage').innerText = bStr;
    document.getElementById('home-qty').innerText = qStr;
    
    // Calculate filtered stats for analytics
    const filteredData = getFilteredBookings();
    let filteredB = 0, filteredQ = 0;
    filteredData.forEach(item => { filteredB += (item.brokerage || 0); filteredQ += (item.qty || 0); });
    const filteredBStr = `₹${filteredB.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    const filteredQStr = `${filteredQ} MT`;
    document.getElementById('stat-brokerage').innerText = filteredBStr;
    document.getElementById('stat-qty').innerText = filteredQStr;
}

function getFilteredBookings() {
    if(!selectedCompanyFilter) return bookingsData;
    return bookingsData.filter(b => 
        b.from === selectedCompanyFilter || b.to === selectedCompanyFilter
    );
}

// --- CHARTS ---
window.changeChartPeriod = (period) => {
    currentChartPeriod = period;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${period}`).classList.add('active');
    renderCharts();
};

function renderCharts() {
    const chartData = getChartData(currentChartPeriod);
    
    // Destroy existing charts
    if(brokerageChart) brokerageChart.destroy();
    if(quantityChart) quantityChart.destroy();
    
    // Brokerage Chart
    const ctx1 = document.getElementById('brokerageChart');
    if(ctx1) {
        brokerageChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Brokerage (₹)',
                    data: chartData.brokerage,
                    borderColor: '#1b5e20',
                    backgroundColor: 'rgba(27, 94, 32, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Brokerage Trend' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Quantity Chart
    const ctx2 = document.getElementById('quantityChart');
    if(ctx2) {
        quantityChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Quantity (MT)',
                    data: chartData.quantity,
                    backgroundColor: '#2563eb',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Quantity Sold' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Update stats with filtered data
    calculateStats();
}

function getChartData(period) {
    const now = new Date();
    let labels = [];
    let brokerageData = [];
    let quantityData = [];
    const filteredBookings = getFilteredBookings();
    
    if(period === 'month') {
        // Last 30 days
        for(let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            labels.push(dateStr);
            
            let dayBrokerage = 0;
            let dayQuantity = 0;
            
            filteredBookings.forEach(booking => {
                if(booking.timestamp && booking.timestamp.toDate) {
                    const bookingDate = booking.timestamp.toDate();
                    if(bookingDate.toDateString() === date.toDateString()) {
                        dayBrokerage += booking.brokerage || 0;
                        dayQuantity += booking.qty || 0;
                    }
                }
            });
            
            brokerageData.push(dayBrokerage);
            quantityData.push(dayQuantity);
        }
    } else {
        // Last 12 months
        for(let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            labels.push(monthStr);
            
            let monthBrokerage = 0;
            let monthQuantity = 0;
            
            filteredBookings.forEach(booking => {
                if(booking.timestamp && booking.timestamp.toDate) {
                    const bookingDate = booking.timestamp.toDate();
                    if(bookingDate.getMonth() === date.getMonth() && 
                       bookingDate.getFullYear() === date.getFullYear()) {
                        monthBrokerage += booking.brokerage || 0;
                        monthQuantity += booking.qty || 0;
                    }
                }
            });
            
            brokerageData.push(monthBrokerage);
            quantityData.push(monthQuantity);
        }
    }
    
    return {
        labels,
        brokerage: brokerageData,
        quantity: quantityData
    };
}

// --- WHATSAPP FUNCTIONALITY ---
window.openWhatsAppModal = (bookingId) => {
    const booking = bookingsData.find(b => b.id === bookingId);
    if(!booking) return alert("Booking not found!");
    
    currentWhatsAppBooking = booking;
    
    // Get company details
    const fromCompany = companiesData.find(c => c.name === booking.from);
    const toCompany = companiesData.find(c => c.name === booking.to);
    
    if(!fromCompany || !toCompany) {
        return alert("Company details not found!");
    }
    
    // Set company names in modal
    document.getElementById('wa-from-name').innerText = `${booking.from} (${fromCompany.phone})`;
    document.getElementById('wa-to-name').innerText = `${booking.to} (${toCompany.phone})`;
    
    // Update template dropdown
    updateTemplateDropdown();
    
    // Generate preview
    updateWhatsAppPreview();
    
    document.getElementById('modal-whatsapp').style.display = 'flex';
};

window.closeWhatsAppModal = () => {
    document.getElementById('modal-whatsapp').style.display = 'none';
    currentWhatsAppBooking = null;
    document.getElementById('wa-template-select').value = '';
};

window.onTemplateChange = () => {
    updateWhatsAppPreview();
};

function updateTemplateDropdown() {
    const select = document.getElementById('wa-template-select');
    if(!select) return;
    
    const opts = templatesData.map(t => 
        `<option value="${t.id}">${t.name} (${t.type})</option>`
    ).join('');
    
    select.innerHTML = `<option value="">Default Template</option>` + opts;
}

function replaceVariables(template, booking, company, isFrom) {
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    return template
        .replace(/{companyName}/g, company.name)
        .replace(/{clientName}/g, company.client)
        .replace(/{grain}/g, booking.grain)
        .replace(/{quantity}/g, booking.qty)
        .replace(/{price}/g, booking.price)
        .replace(/{brokerage%}/g, booking.perc)
        .replace(/{brokerageAmount}/g, booking.brokerage.toFixed(2))
        .replace(/{fromCompany}/g, booking.from)
        .replace(/{toCompany}/g, booking.to)
        .replace(/{date}/g, date);
}

function updateWhatsAppPreview() {
    if(!currentWhatsAppBooking) return;
    
    const booking = currentWhatsAppBooking;
    const templateId = document.getElementById('wa-template-select').value;
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    let message;
    
    if(templateId) {
        const template = templatesData.find(t => t.id === templateId);
        if(template) {
            const fromCompany = companiesData.find(c => c.name === booking.from);
            message = replaceVariables(template.content, booking, fromCompany, true);
        }
    } else {
        // Default template
        message = `🌾 *Grain Booking Confirmation*

📦 *Grain Type:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *From:* ${booking.from}
📍 *To:* ${booking.to}
📅 *Date:* ${date}

Thank you for your business!
_GrainBroker Pro_`;
    }
    
    document.getElementById('wa-preview').innerText = message;
}

window.sendWhatsAppMessages = () => {
    if(!currentWhatsAppBooking) return;
    
    const booking = currentWhatsAppBooking;
    const sendToFrom = document.getElementById('wa-from').checked;
    const sendToTo = document.getElementById('wa-to').checked;
    
    if(!sendToFrom && !sendToTo) {
        return alert("Please select at least one recipient!");
    }
    
    const fromCompany = companiesData.find(c => c.name === booking.from);
    const toCompany = companiesData.find(c => c.name === booking.to);
    const templateId = document.getElementById('wa-template-select').value;
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    let messageFrom, messageTo;
    
    if(templateId) {
        const template = templatesData.find(t => t.id === templateId);
        if(template) {
            if(template.type === 'both') {
                messageFrom = replaceVariables(template.content, booking, fromCompany, true);
                messageTo = replaceVariables(template.content, booking, toCompany, false);
            } else if(template.type === 'sender') {
                messageFrom = replaceVariables(template.content, booking, fromCompany, true);
                messageTo = getDefaultToMessage(booking, toCompany, date);
            } else {
                messageFrom = getDefaultFromMessage(booking, fromCompany, date);
                messageTo = replaceVariables(template.content, booking, toCompany, false);
            }
        }
    } else {
        messageFrom = getDefaultFromMessage(booking, fromCompany, date);
        messageTo = getDefaultToMessage(booking, toCompany, date);
    }
    
    // Send messages sequentially with proper delay
    let sentCount = 0;
    
    if(sendToFrom) {
        const phoneFrom = fromCompany.phone.replace(/[^0-9]/g, '');
        const urlFrom = `https://wa.me/91${phoneFrom}?text=${encodeURIComponent(messageFrom)}`;
        window.open(urlFrom, '_blank');
        sentCount++;
    }
    
    if(sendToTo) {
        setTimeout(() => {
            const phoneTo = toCompany.phone.replace(/[^0-9]/g, '');
            const urlTo = `https://wa.me/91${phoneTo}?text=${encodeURIComponent(messageTo)}`;
            window.open(urlTo, '_blank');
        }, sendToFrom ? 2000 : 0); // 2 second delay if sending both
        sentCount++;
    }
    
    window.closeWhatsAppModal();
    
    if(sentCount === 2) {
        alert("Opening 2 WhatsApp chats - one for sender and one for receiver. Please send each message separately!");
    } else {
        alert("WhatsApp opened! Please send the message.");
    }
};

function getDefaultFromMessage(booking, fromCompany, date) {
    return `🌾 *Grain Booking Confirmation*

Dear ${fromCompany.client},

Your booking details:
📦 *Grain:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *Delivering To:* ${booking.to}
📅 *Date:* ${date}

Thank you for choosing our services!
_GrainBroker Pro_`;
}

function getDefaultToMessage(booking, toCompany, date) {
    return `🌾 *Grain Delivery Notification*

Dear ${toCompany.client},

Incoming grain delivery:
📦 *Grain:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *From:* ${booking.from}
📅 *Date:* ${date}

Please prepare for receiving the shipment.
_GrainBroker Pro_`;
}

// --- TEMPLATE MANAGEMENT ---
function renderTemplates() {
    const list = document.getElementById('templates-list');
    if(!list) return;
    
    if(templatesData.length === 0) { 
        list.innerHTML = `<div class="empty-state">No templates yet. Create your first one!</div>`; 
        return; 
    }
    
    list.innerHTML = templatesData.map(t => `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div style="flex: 1;">
                <strong>${t.name}</strong>
                <span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 6px; font-size: 11px; margin-left: 8px;">
                    ${t.type === 'sender' ? 'Sender' : t.type === 'receiver' ? 'Receiver' : 'Both'}
                </span>
                <pre style="margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 8px; font-size: 13px; white-space: pre-wrap; overflow-x: auto;">${t.content}</pre>
            </div>
            <div class="action-links">
                <span class="edit-link" onclick="window.editTemplate('${t.id}')">Edit</span>
                <span class="delete-link" onclick="window.deleteTemplate('${t.id}')">Delete</span>
            </div>
        </div>
    </div>`).join('');
}

window.showTemplateModal = () => {
    editTemplateId = null;
    document.getElementById('template-modal-title').innerText = "Create Template";
    document.getElementById('template-name').value = "";
    document.getElementById('template-type').value = "sender";
    document.getElementById('template-content').value = "";
    document.getElementById('modal-template').style.display = 'flex';
};

window.closeTemplateModal = () => {
    document.getElementById('modal-template').style.display = 'none';
    editTemplateId = null;
};

window.saveTemplate = async () => {
    const name = document.getElementById('template-name').value.trim();
    const type = document.getElementById('template-type').value;
    const content = document.getElementById('template-content').value.trim();
    
    if(!name || !content) return alert("Please fill all fields!");
    
    const data = { 
        name, type, content, 
        updatedAt: serverTimestamp(),
        userId: auth.currentUser.uid 
    };
    
    try {
        if(editTemplateId) {
            await updateDoc(doc(db, "templates", editTemplateId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "templates"), data);
        }
        window.closeTemplateModal();
    } catch(e) {
        alert("Error: " + e.message);
    }
};

window.editTemplate = (id) => {
    const template = templatesData.find(t => t.id === id);
    if(!template) return;
    
    editTemplateId = id;
    document.getElementById('template-modal-title').innerText = "Edit Template";
    document.getElementById('template-name').value = template.name;
    document.getElementById('template-type').value = template.type;
    document.getElementById('template-content').value = template.content;
    document.getElementById('modal-template').style.display = 'flex';
};

window.deleteTemplate = (id) => {
    deleteTemplateTargetId = id;
    document.getElementById('modal-confirm-template').style.display = 'flex';
};

window.confirmDeleteTemplate = async () => {
    if(deleteTemplateTargetId) {
        try {
            await deleteDoc(doc(db, "templates", deleteTemplateTargetId));
            window.closeConfirmTemplateModal();
        } catch(e) {
            alert("Error: " + e.message);
        }
    }
};

window.closeConfirmTemplateModal = () => {
    deleteTemplateTargetId = null;
    document.getElementById('modal-confirm-template').style.display = 'none';
};

// Update preview when checkboxes change
document.addEventListener('change', (e) => {
    if(e.target.id === 'wa-from' || e.target.id === 'wa-to') {
        updateWhatsAppPreview();
    }
});

// --- EXPORTS ---
window.exportBookings = () => {
    if(bookingsData.length === 0) {
        alert("No data to export!");
        return;
    }
    
    const exportData = bookingsData.map(booking => ({
        'Grain': booking.grain,
        'Quantity (MT)': booking.qty,
        'Price (₹)': booking.price,
        'Brokerage %': booking.perc,
        'Brokerage Amount (₹)': booking.brokerage ? booking.brokerage.toFixed(2) : 0,
        'From': booking.from,
        'To': booking.to,
        'Date': booking.timestamp && booking.timestamp.toDate ? 
                booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `Grain_Bookings_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.xlsx`);
};

window.downloadReport = () => {
    const reportContainer = document.getElementById('report-container');
    html2canvas(reportContainer, {
        backgroundColor: '#ffffff',
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `GrainBroker_Report_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
};

// --- BINDINGS ---
document.getElementById('btn-login').addEventListener('click', window.handleLogin);
document.getElementById('btn-signup').addEventListener('click', window.handleSignup);
document.getElementById('btn-reset').addEventListener('click', window.handleReset);

window.showCompanyModal = () => {
    editCompanyId = null;
    document.getElementById('company-modal-title').innerText = "Add New Company";
    ['comp-name', 'comp-phone', 'comp-client', 'comp-state'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('modal-company').style.display = 'flex';
};
window.closeCompanyModal = () => document.getElementById('modal-company').style.display = 'none';

window.showBookingModal = () => {
    editBookingId = null;
    document.getElementById('booking-modal-title').innerText = "New Booking";
    ['book-grain', 'book-qty', 'book-price', 'book-perc', 'book-from', 'book-to'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('modal-booking').style.display = 'flex';
};
window.closeBookingModal = () => {
    document.getElementById('modal-booking').style.display = 'none';
    editBookingId = null;
};
