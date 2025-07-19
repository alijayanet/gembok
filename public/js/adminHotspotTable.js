$(function() {
  // Custom sorting untuk kolom status: 'Aktif' > 'Offline'
  $.fn.dataTable.ext.order['status-aktif'] = function(settings, col) {
    return this.api().column(col, {order:'index'}).nodes().map(function(td, i) {
      const val = $(td).text().trim().toLowerCase();
      if (val === 'aktif') return 1;
      if (val === 'offline') return 0;
      return -1;
    });
  };

  const hotspotTable = $('#hotspotTable').DataTable({
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    responsive: true,
    dom: '<"d-flex justify-content-between align-items-center mb-3"<"d-flex align-items-center"l><"d-flex"f><"ms-3"#statusFilterContainer>>rtip',
    order: [[4, 'desc'], [0, 'asc']], // Status dulu, lalu No
    columnDefs: [
      { targets: 4, orderDataType: 'status-aktif' },
      { targets: -1, orderable: false, width: '20%', className: 'text-center' },
      { targets: 0, width: '5%', className: 'text-center' },
      { targets: 1, width: '20%', className: 'fw-bold text-start' },
      { targets: 2, width: '20%', className: 'text-center' },
      { targets: 3, width: '15%', className: 'text-center' },
      { targets: 4, width: '10%', className: 'text-center' }
    ],
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json',
      paginate: {
        previous: '<i class="bi bi-chevron-left"></i>',
        next: '<i class="bi bi-chevron-right"></i>'
      },
      info: 'Menampilkan _START_ sampai _END_ dari _TOTAL_ user',
      lengthMenu: 'Tampilkan _MENU_ user',
      search: 'Cari:',
      zeroRecords: 'Tidak ada user ditemukan',
      infoEmpty: 'Menampilkan 0 sampai 0 dari 0 user',
      infoFiltered: '(difilter dari _MAX_ total user)'
    }
  });

  // Tambahkan dropdown filter status
  const statusFilter = $('<select class="form-select form-select-sm ms-2" style="width:auto; display:inline-block;"><option value="">Semua Status</option><option value="Aktif">Aktif</option><option value="Offline">Offline</option></select>');
  $('#statusFilterContainer').append(statusFilter);

  // Filter DataTables berdasarkan status
  statusFilter.on('change', function() {
    const val = $(this).val();
    if (val) {
      hotspotTable.column(4).search('^' + val + '$', true, false).draw();
    } else {
      hotspotTable.column(4).search('', true, false).draw();
    }
    updateActiveUserCount();
    // Selalu urutkan status Aktif di atas
    hotspotTable.order([4, 'desc'], [0, 'asc']).draw();
  });

  // Pastikan urutan status selalu prioritas saat search
  $('#hotspotTable_filter input').on('input', function() {
    // Tunggu sejenak agar search diterapkan
    setTimeout(function() {
      hotspotTable.order([4, 'desc'], [0, 'asc']).draw();
    }, 100);
  });

  // Fungsi update jumlah user aktif di card statistik
  function updateActiveUserCount() {
    let count = 0;
    hotspotTable.rows({ search: 'applied' }).every(function() {
      const data = this.data();
      if (data[4] && data[4].toLowerCase() === 'aktif') count++;
    });
    $('#activeUserCount').text(count);
  }

  // Update jumlah user aktif saat tabel di-draw
  hotspotTable.on('draw', function() {
    updateActiveUserCount();
  });

  // Inisialisasi pertama
  updateActiveUserCount();

  // Handler tombol edit
  $('#hotspotTable').on('click', '.edit-user-btn', function() {
    const username = $(this).data('username');
    const password = $(this).data('password');
    const profile = $(this).data('profile');
    // Tampilkan modal edit user, isi field
    $('#editUsername').val(username);
    $('#editPassword').val(password);
    $('#editProfile').val(profile);
    $('#originalUsername').val(username);
    $('#editUserModal').modal('show');
  });

  // Handler tombol hapus
  $('#hotspotTable').on('click', '.delete-user-btn', function() {
    const username = $(this).data('username');
    if (confirm('Yakin hapus user ' + username + '?')) {
      // Submit form hapus secara dinamis
      const form = $('<form>', { method: 'POST', action: '/admin/hotspot/delete' });
      form.append($('<input>', { type: 'hidden', name: 'username', value: username }));
      $('body').append(form);
      form.submit();
    }
  });

  // Handler tombol disconnect
  let disconnectUsername = '';
  $('#hotspotTable').on('click', '.disconnect-session-btn', function() {
    disconnectUsername = $(this).data('username');
    $('#disconnectUsername').text(disconnectUsername);
    $('#disconnectUserModal').modal('show');
  });

  // Konfirmasi disconnect
  $('#confirmDisconnect').on('click', function() {
    if (!disconnectUsername) return;
    $.ajax({
      url: '/admin/hotspot/disconnect-user',
      method: 'POST',
      data: { username: disconnectUsername },
      success: function(res) {
        $('#disconnectUserModal').modal('hide');
        showToast('Berhasil', 'User ' + disconnectUsername + ' berhasil diputus.', 'success');
        setTimeout(() => window.location.reload(), 1000);
      },
      error: function(xhr) {
        $('#disconnectUserModal').modal('hide');
        let msg = 'Gagal memutus user.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        showToast('Error', msg, 'danger');
      }
    });
  });

  // Fungsi notifikasi toast
  function showToast(title, message, type) {
    $('#toastTitle').text(title);
    $('#toastMessage').text(message);
    $('#toastHeader').removeClass('bg-success bg-danger bg-warning').addClass('bg-' + type);
    $('#toastIcon').removeClass().addClass('bi me-2 ' + (type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-x-circle-fill' : 'bi-exclamation-triangle-fill'));
    $('#notificationToast').toast('show');
  }
});

// Fungsi untuk memformat uptime user hotspot
function formatUptime(uptimeStr) {
    if (!uptimeStr) return '-';
    
    // Format seperti 1d2h3m4s menjadi 1 hari 2 jam 3 menit 4 detik
    const days = uptimeStr.match(/([0-9]+)d/);
    const hours = uptimeStr.match(/([0-9]+)h/);
    const minutes = uptimeStr.match(/([0-9]+)m/);
    const seconds = uptimeStr.match(/([0-9]+)s/);
    
    let result = '';
    if (days) result += days[1] + ' hari ';
    if (hours) result += hours[1] + ' jam ';
    if (minutes) result += minutes[1] + ' menit ';
    if (seconds) result += seconds[1] + ' detik';
    
    return result.trim();
}
