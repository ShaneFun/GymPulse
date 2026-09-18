import { Line } from 'react-chartjs-2';

function ProgressTab({ workoutHistory, chartData, chartOptions }) {
  return (
    <div>
      {workoutHistory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Complete a workout to see your progress here!
          </p>
        </div>
      ) : (
        <>
          <p className="section-label">Total Reps Over Time</p>
          <div className="card">
            <Line options={chartOptions} data={chartData} />
          </div>

          <p className="section-label">Session History</p>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr 0.7fr 0.7fr 0.6fr',
            gap: 4, padding: '8px 12px',
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span>Date</span>
            <span>Exercise</span>
            <span style={{ textAlign: 'center' }}>Sets</span>
            <span style={{ textAlign: 'center' }}>Reps</span>
            <span style={{ textAlign: 'center' }}>Result</span>
          </div>

          {workoutHistory.map(log => {
            const repsArr = Array.isArray(log.actual_reps) ? log.actual_reps : [];
            const totalReps = repsArr.reduce((a, b) => a + b, 0);
            const setsDone = repsArr.length;
            return (
              <div key={log.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.2fr 0.7fr 0.7fr 0.6fr',
                gap: 4, padding: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 10, marginBottom: 6,
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  {log.exercise_name}
                </span>
                <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                  {setsDone}/{log.target_sets}
                </span>
                <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                  {totalReps}
                </span>
                <span style={{ textAlign: 'center' }}>
                  <span className={`badge ${log.status === 'PASS' ? 'badge-pass' : 'badge-fail'}`}
                    style={{ fontSize: '0.65rem', padding: '3px 6px' }}>
                    {log.status === 'PASS' ? '✅' : '❌'}
                  </span>
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default ProgressTab;
