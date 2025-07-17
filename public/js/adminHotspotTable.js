// DataTables for Hotspot User Table
$(function() {
    $('#allUsersTable').DataTable({
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        responsive: true,
        scrollX: true,
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
        },
        columnDefs: [
            { targets: -1, orderable: false, responsivePriority: 1 }, // Aksi
            { targets: 0, responsivePriority: 2 }, // Username
            { targets: 1, responsivePriority: 3 }, // Password
            { targets: 2, responsivePriority: 4 }  // Profile
        ]
    });
});
