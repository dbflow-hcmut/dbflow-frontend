"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Check, ChevronDown, Gift, Menu, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import styles from "./stellar-hero.module.css";

const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] as const } },
};

const services = [
  { title: "Database modeling", tone: "checklist", list: ["Conceptual diagrams", "Logical schemas", "Physical models", "Smart relationships", "Keys & constraints", "DBMS-ready design", "And more"] },
  { title: "AI schema generation", tone: "aiVideo", tags: ["Natural language", "Context-aware", "Schema docs"], video: "https://www.pexels.com/download/video/29329514/" },
  { title: "Collaborative workspace", tone: "collabVideo", tags: ["Live editing", "Comments", "Version history", "Team review"], video: "https://www.pexels.com/download/video/19552038/" },
  { title: "SQL intelligence & delivery", tone: "sqlVideo", tags: ["DDL export", "Safe queries", "Migration SQL", "AI validation"], video: "https://www.pexels.com/download/video/32880716/" },
  { title: "Visual schema conversion", tone: "convertVideo", tags: ["Conceptual", "Logical", "Physical", "Auto mapping"], video: "https://www.pexels.com/download/video/36018100/" },
  { title: "Database deployment", tone: "deployVideo", tags: ["PostgreSQL", "MySQL", "SQL Server", "Oracle"], video: "https://www.pexels.com/download/video/33717463/" },
];

const steps = [
  ["01", "Create a project", "Start from scratch, import DDL, or connect an existing database."],
  ["02", "Design your schema", "Model every layer visually with smart constraints and clear relationships."],
  ["03", "Build with AI", "Generate, validate, and improve schemas or SQL using project context."],
  ["04", "Ship with confidence", "Collaborate, run safe queries, and export production-ready DDL."],
];

const databases = [
  { name: "PostgreSQL", icon: "/database-logos/postgresql.svg" },
  { name: "MySQL", icon: "/database-logos/mysql.svg" },
  { name: "SQL Server", icon: "/database-logos/sql-server.svg" },
  { name: "MongoDB", icon: "/database-logos/mongodb.svg" },
  { name: "Oracle", icon: "/database-logos/oracle.svg" },
];

const rotatingWords = ["schema", "database", "modeling", "SQL"];

function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % rotatingWords.length), 2000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className={styles.rotatingWords} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          className={styles.rotatingWord}
          key={rotatingWords[index]}
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {rotatingWords[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Button({ children, href = "/auth/signup", light = false }: { children: React.ReactNode; href?: string; light?: boolean }) {
  return <Link className={`${styles.button} ${light ? styles.buttonLight : ""}`} href={href}><span>{children}</span><ArrowRight size={17} /></Link>;
}

function Logo() {
  return <Link href="/" className={styles.logo} aria-label="DB Flow home"><Image src="/favicon.ico" alt="DB Flow" width={31} height={31} priority /><span>DB Flow</span></Link>;
}

export default function StellarHero() {
  const [activeHowStep, setActiveHowStep] = useState(0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <nav className={styles.nav}>
          <a href="#product">Product</a>
          <a href="#solutions">Solutions</a>
          <a href="#how">How it works</a>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className={styles.headerActions}><Link href="/auth/signin">Log in</Link><Button>Start free</Button></div>
        <button className={styles.menu} aria-label="Open menu"><Menu /></button>
      </header>

      <div className={styles.adBannerWrap}>
        <aside className={styles.adBanner} aria-label="Featured report">
          <div className={styles.adVisualLeft} aria-hidden="true"><video autoPlay loop muted playsInline preload="metadata"><source src="https://cdn.prod.website-files.com/68c2a33d71ce477bc4cfa871%2F696916c69e27d88328ee099a_Web%20banner_mp4.mp4" type="video/mp4" /></video></div>
          <div className={styles.adVisualRight} aria-hidden="true"><video autoPlay loop muted playsInline preload="metadata"><source src="https://cdn.prod.website-files.com/68c2a33d71ce477bc4cfa871%2F696916c69e27d88328ee099a_Web%20banner_mp4.mp4" type="video/mp4" /></video></div>
          <p>✨ <span>Turn your database requirements into production-ready schemas with DB Flow</span></p>
          <Link className={styles.adButton} href="#product">Explore DB Flow <Gift size={15} /></Link>
        </aside>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <motion.div initial="hidden" animate="visible" variants={reveal}>
            <div className={styles.badges}>
              <span className={styles.teamBadge}><BadgeCheck size={18} /> Built for modern data teams</span>
              <span className={styles.rating}><Image src="/icon-google.png" alt="Google" width={17} height={17} /><b>4.9</b><Star size={16} /><b>4.9</b></span>
            </div>
            <h1>All your <RotatingWord /><small>tasks done in one collaborative workspace</small></h1>
          </motion.div>
          <motion.div className={styles.heroSide} initial="hidden" animate="visible" variants={reveal} transition={{ delay: .15 }}>
            <p>Stop switching between disconnected database tools. Start designing, validating, and shipping reliable schemas with your whole team.</p>
            <div className={styles.faceLine}><div className={styles.faces}><i /><i /><i /></div><span>Trusted by builders worldwide</span></div>
            <Button>Start designing</Button>
          </motion.div>
        </div>
        <div className={styles.heroBottom}>
          <div className={styles.stats}><div><strong>3</strong><span>modeling<br />layers</span></div><div><strong>AI</strong><span>grounded in<br />your schema</span></div></div>
          <div className={styles.logoMarquee} aria-label="Supported databases">
            <div className={styles.logoTrack}>
              {[0, 1].map((group) => <div className={styles.logoGroup} aria-hidden={group === 1} key={group}>
                {databases.map((database) => <span className={styles.databaseLogo} key={`${group}-${database.name}`}><Image src={database.icon} alt="" width={28} height={28} /><strong>{database.name}</strong></span>)}
              </div>)}
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.roundSection} ${styles.services}`} id="product">
        <motion.div className={styles.sectionTitle} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .25 }} variants={reveal}>
          <span>One connected workspace</span><h2>Everything your database needs,<br />without the tool sprawl.</h2>
        </motion.div>
        <div className={styles.serviceGrid}>
          {services.map((service, index) => <motion.article key={service.title} className={`${styles.serviceCard} ${styles[service.tone]}`} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ delay: index * .08, duration: .65 }}>
            {service.video && <div className={styles.cardMedia} aria-hidden="true">
              <video autoPlay loop muted playsInline preload="metadata" src={service.video} />
            </div>}
            <h3>{service.title}</h3>
            {service.list && <ul>{service.list.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul>}
            {service.tags && <div className={styles.tags}>{service.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
            <span className={styles.cardNumber}>0{index + 1}</span>
          </motion.article>)}
        </div>
      </section>

      <section className={`${styles.roundSection} ${styles.bottlenecks}`} id="solutions">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: .2 }} variants={reveal}><h2>We solve the bottlenecks<br />that kill your speed</h2></motion.div>
        <div className={styles.bottleGrid}>
          <div className={styles.problemList}>
            {["Forget scattered diagramming tools", "No more schemas lost in old docs", "Stop rewriting the same SQL", "Skip fragile handoffs between teams", "Done with unreviewed database changes"].map((item, i) => <div key={item}><span><ArrowRight size={17} /></span><p><em>{i % 2 ? "No more " : "Move past "}</em>{item.replace(/^(Forget|No more|Stop|Skip|Done with) /, "")}</p></div>)}
          </div>
          <div className={styles.quote}><div className={styles.quoteHead}><Image className={styles.avatar} src="/thanh-tai.jpg" alt="Thanh Tai" width={44} height={44} /><div><strong>Thanh Tai</strong><small>Fullstack Developer</small></div></div><p>“DB Flow turned database design from a slow handoff into one shared workflow. Our team moves from requirements to reviewed SQL in days, not weeks.”</p></div>
          <div className={styles.metrics}><div><strong>70%</strong><span>less time spent<br />switching tools</span></div><div><strong>40%</strong><span>faster schema<br />reviews</span></div><div><strong>60%</strong><span>fewer avoidable<br />revisions</span></div></div>
        </div>
      </section>

      <section className={`${styles.roundSection} ${styles.how}`} id="how">
        <div className={styles.sectionTitle}><h2>How it works</h2><p>Skip the database design headache.<br />Move right to a reliable schema.</p></div>
        <div className={styles.howTabs}>
          <div className={styles.howAccordion}>{steps.map(([number, title, body], index) => <button type="button" onClick={() => setActiveHowStep(index)} className={`${styles.howTab} ${activeHowStep === index ? styles.howTabActive : ""}`} key={number} aria-expanded={activeHowStep === index}>
            <span className={styles.howTabHeader}><i>{number}</i><strong>{title}</strong><b><ChevronDown size={18} /></b></span>
            {activeHowStep === index && <motion.span className={styles.howTabDetails} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><span>{body}</span><Link href="/auth/signup">Get started <ArrowRight size={15} /></Link></motion.span>}
          </button>)}</div>
          <div className={styles.howVisual}>
            <div className={styles.glassWorkspace}>
              <div className={styles.workspaceTop}><span>DB Flow workspace</span><b>New schema +</b></div>
              <div className={styles.workspaceColumns}>{["Ideas", "In progress", "Ready"].map((column, columnIndex) => <div key={column}><strong>{column}</strong>{[0, 1, 2].slice(0, columnIndex === 1 ? 3 : 2).map(item => <span key={item}><i />{["Customer schema", "Add relationships", "Review constraints", "Generate SQL"][columnIndex + item]}</span>)}</div>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.roundSection} ${styles.ctaSection}`}>
        <video className={styles.ctaBackgroundVideo} autoPlay loop muted playsInline preload="metadata" aria-hidden="true"><source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_204221_5339e40b-e73d-4ab0-9c65-79c18c66fd50.mp4" type="video/mp4" /></video>
        <div className={styles.ctaVideoOverlay} />
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}><p>Build databases with clarity</p><h2>You are one click away<br />from your best schema yet.</h2><p>Start free. No credit card required.</p><Button light>Start designing</Button></motion.div>
      </section>

      <footer className={styles.footer}><div><Logo /><p>The collaborative database design workspace.</p></div><div><strong>Product</strong><a href="#product">Features</a><Link href="/pricing">Pricing</Link><a href="#how">How it works</a></div><div><strong>Company</strong><a href="#solutions">About</a><a href="mailto:hello@dbflow.dev">Contact</a><a href="#">Changelog</a></div><div><strong>Legal</strong><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Security</a></div></footer>
    </main>
  );
}
