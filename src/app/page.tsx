export default function Home() {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Cibiti</span></div>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span className="nav-icon">+</span>Overview</a>
          <a className="nav-item" href="#exams"><span className="nav-icon">[]</span>My exams</a>
          <a className="nav-item" href="#results"><span className="nav-icon">/</span>Results</a>
          <a className="nav-item" href="/exams"><span className="nav-icon">[]</span>My exams</a>
          <a className="nav-item" href="/question-bank"><span className="nav-icon">*</span>Question bank</a>
          <a className="nav-item" href="/question-bank/new"><span className="nav-icon">+</span>Add question</a>
          <a className="nav-item" href="/exams/new"><span className="nav-icon">E</span>Create exam</a>
          <a className="nav-item" href="/results"><span className="nav-icon">/</span>Results</a>
          <a className="nav-item" href="/exams/demo/take"><span className="nav-icon">T</span>Take exam</a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/sign-in"><span className="nav-icon">?</span>Sign in</a>
          <div className="profile"><div className="avatar">AO</div><div><strong>Alex Okafor</strong><span>Student account</span></div><span className="more">...</span></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><button className="icon-button" aria-label="Notifications">!!</button><div className="mini-avatar">AO</div></div></header>
        <section className="intro"><div><p className="eyebrow">Wednesday, August 26, 2026</p><h1>Good afternoon, Alex.</h1><p className="intro-copy">Keep your momentum going. You have one assessment waiting for you.</p></div><a className="primary-button" href="#exams">View my exams <span>-&gt;</span></a></section>

        <section className="stats-grid" aria-label="Progress summary">
          <article className="stat-card"><div className="stat-label">ASSESSMENTS COMPLETED</div><strong>12</strong><span className="trend positive">+3 this month</span></article>
          <article className="stat-card"><div className="stat-label">AVERAGE SCORE</div><strong>84<span className="unit">%</span></strong><span className="trend positive">+6% from last month</span></article>
          <article className="stat-card highlight"><div className="stat-label">CURRENT STREAK</div><strong>07 <span className="unit">days</span></strong><span className="trend neutral">Personal best: 14 days</span></article>
        </section>

        <section className="content-grid">
          <div className="panel upcoming-panel" id="exams"><div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Upcoming assessments</h2></div><a href="#all-exams">See all <span>-&gt;</span></a></div><div className="exam-row"><div className="subject-icon blue">M</div><div className="exam-details"><h3>Mathematics: Core Concepts</h3><p>20 questions <span>•</span> 30 minutes</p></div><div className="exam-date"><span>Due in</span><strong>2 days</strong></div><a className="secondary-button" href="#begin">Begin</a></div><div className="exam-row"><div className="subject-icon green">S</div><div className="exam-details"><h3>General Science Review</h3><p>15 questions <span>•</span> 20 minutes</p></div><div className="exam-date"><span>Due in</span><strong>8 days</strong></div><button className="outline-button">Preview</button></div></div>
          <div className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR JOURNEY</p><h2>Recent activity</h2></div><a href="#results">View results <span>-&gt;</span></a></div><div className="activity-item"><div className="activity-dot done">+</div><div><h3>Biology Fundamentals</h3><p>Completed yesterday</p></div><strong>92%</strong></div><div className="activity-item"><div className="activity-dot done">+</div><div><h3>English Comprehension</h3><p>Completed Aug 21</p></div><strong>81%</strong></div><div className="activity-item"><div className="activity-dot review">~</div><div><h3>Physics: Motion & Energy</h3><p>Needs review</p></div><strong className="muted-score">68%</strong></div></div>
        </section>

        <section className="focus-banner"><div className="focus-symbol">//</div><div><p className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</p><h2>Ready for a quick practice round?</h2><p>Sharpen a topic in five questions and keep your streak alive.</p></div><a href="#practice" className="text-button">Practice now <span>-&gt;</span></a></section>
      </main>
    </div>
  );
}
