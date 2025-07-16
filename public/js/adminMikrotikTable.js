$(document).ready(function(){
    $('#pppoeTable').DataTable({
        "responsive": true,
        "scrollX": true,
        "columnDefs": [
            {
                "targets": [0], // No column
                "responsivePriority": 1
            },
            {
                "targets": [1], // Username column
                "responsivePriority": 2
            },
            {
                "targets": [-1], // Action column (last column)
                "responsivePriority": 3,
                "orderable": false
            }
        ],
        language: {
            search: 'Cari:',
            lengthMenu: 'Tampilkan _MENU_ entri',
            info: 'Menampilkan _START_ sampai _END_ dari _TOTAL_ entri',
            paginate: {
                first: 'Pertama',
                last: 'Terakhir',
                next: 'Berikutnya',
                previous: 'Sebelumnya'
            },
            zeroRecords: 'Tidak ditemukan data yang cocok',
            infoEmpty: 'Menampilkan 0 sampai 0 dari 0 entri',
            infoFiltered: '(disaring dari _MAX_ total entri)'
        }
    });
});
