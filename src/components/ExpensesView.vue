<template>
  <div class="card p-3">
    <h4>Expenses & Split</h4>
    <p class="text-muted small">Currency conversion: ₩90,000 ≈ $87 SGD</p>
    <table class="table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Paid By</th>
          <th>Amount (KRW)</th>
          <th>Split</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Myeongdong Dinner</td>
          <td>Sarah</td>
          <td>₩90,000</td>
          <td>Split equally (Sarah, John, Amy)</td>
        </tr>
      </tbody>
    </table>
    <div class="alert alert-info">
      <strong>Settlement Recommendation:</strong> John owes Sarah $29 SGD | Amy owes Sarah $29 SGD
    </div>
  </div>
</template>

<script>
export default {}
</script>