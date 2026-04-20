const KM_ROWS: [string, string, string][] = [
  ['< 161','Actual time','Cl. 146.4(c) — actual time + excess travel paid normally'],
  ['161 – 192','5.0','Cl. 146.4(d): additional un-associated duties payable for ≥161 km shifts'],
  ['193 – 224','6.0',''],
  ['225 – 256','7.0',''],
  ['257 – 289','8.0','Cl. 146.4(e)(f): double-shift construction — round trip, min 30 min meal break'],
  ['290 – 321','9.0',''],
  ['322 – 337','10.0',''],
  ['338 – 353','10.5',''],
  ['354 – 369','11.0',''],
  ['370 – 385','11.5','Cl. 146.4(g)(h)(i): ≥370 km — max 4/wk, relieved at terminal, 8 hr traffic cap'],
  ['386 – 401','12.0',''],
  ['402 – 417','12.5',''],
  ['418 – 434','13.0',''],
  ['435 – 450','13.5',''],
  ['451 – 466','14.0',''],
  ['467 – 482','14.5',''],
  ['483 – 498','15.0',''],
  ['499 – 514','15.5',''],
  ['515 – 530','16.0',''],
  ['531 – 546','16.5',''],
  ['547 – 562','17.0',''],
  ['563 – 578','17.5',''],
  ['579 – 594','18.0',''],
  ['595 – 611','18.5',''],
  ['612 – 627','19.0',''],
  ['628 – 643','19.5',''],
  ['644+','+0.5 hr per 16 km','Same construction extended (Cl. 146.4(a) note)'],
]

export default function KmTableTab() {
  return (
    <div className="card">
      <h2>Cl. 146.4(a) — Intercity Kilometreage Payments <span className="ea-ref">(EA 2025)</span></h2>
      <div className="g2" style={{marginBottom:12}}>
        <div className="alert alert-info" style={{marginTop:0}}>
          <strong>Cl. 146.4(b):</strong> Credited excess time stands alone — NOT included in OT computation.
        </div>
        <div className="alert alert-info" style={{marginTop:0}}>
          <strong>Cl. 157.1:</strong> Driver paid the GREATER of (a) scheduled shift time OR (b) KM-credited hrs + un-associated work time.
        </div>
      </div>
      <table>
        <thead>
          <tr><th>KM range (≥ to &lt;)</th><th>Hours credited</th><th>Notes / EA conditions</th></tr>
        </thead>
        <tbody>
          {KM_ROWS.map(([range,hrs,note],i)=>(
            <tr key={i}>
              <td style={{fontFamily:'monospace',fontSize:12}}>{range}</td>
              <td style={{fontWeight:hrs!=='Actual time'?600:undefined,color:hrs!=='Actual time'?'var(--blue-text)':undefined}}>{hrs}</td>
              <td style={{fontSize:11,color:'var(--text3)'}}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note" style={{marginTop:10}}>
        All Mt Victoria intercity trains (3151–3168, 3651–3664) operate under this schedule.
        KM credit paid at ordinary base rate only. Credits do not attract shift penalties or OT loading.
      </p>
    </div>
  )
}
