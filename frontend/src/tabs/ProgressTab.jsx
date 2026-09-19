import { Line } from 'react-chartjs-2';
import { TrendingUp } from 'lucide-react';

function ProgressTab({ workoutHistory, chartData, chartOptions }) {
  return (
    <div>
      <h1 className="screen-heading">Progress</h1>

      {workoutHistory.length === 0 ? (
        <div className="empty">
          <TrendingUp size={32} strokeWidth={1.5} />
          <p>Complete a workout to see your progress here!</p>
        </div>
      ) : (
        <>
          <div className="section-heading">Total Reps Over Time</div>
          <div className="card">
            <div className="chart-wrap">
              <Line options={chartOptions} data={chartData} />
            </div>
          </div>

          <div className="section-heading">History</div>
          {workoutHistory.map(log => {
            const repsArr = Array.isArray(log.actual_reps) ? log.actual_reps : [];
            const totalReps = repsArr.reduce((a, b) => a + b, 0);
            const setsDone = repsArr.length;
            return (
              <div key={log.id} className="row">
                <div>
                  <div className="row-title">{log.exercise_name}</div>
                  <div className="row-sub">
                    {new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {' · '}
                    <span className="tnum">{setsDone}</span>/<span className="tnum">{log.target_sets}</span> sets
                    {' · '}
                    <span className="tnum">{totalReps}</span> reps
                  </div>
                </div>
                <span className={`badge ${log.status === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>
                  {log.status === 'PASS' ? 'PASS' : 'FAIL'}
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
