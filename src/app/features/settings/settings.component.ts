import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { IngresoTemplatesService, IngresoTemplate } from '../../shared/services/ingreso-templates.service';
import { DeudasService } from '../../shared/services/deudas.service';
import { AhorroTemplatesService } from '../../shared/services/ahorro-templates.service';
import { FondosAhorroService } from '../../shared/services/fondos-ahorro.service';
import { Deuda, AhorroTemplate, UserProfile, FondoAhorro } from '../../shared/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  templates = signal<IngresoTemplate[]>([]);
  deudas = signal<Deuda[]>([]);
  deudasArchivadas = signal<Deuda[]>([]);
  ahorroTemplates = signal<AhorroTemplate[]>([]);
  profile = signal<UserProfile | null>(null);

  totalIngresosFijos = computed(() =>
    this.templates().reduce((sum, t) => sum + (t.esperado ?? 0), 0)
  );

  totalDeudaPendiente = computed(() =>
    this.deudas().reduce((sum, d) => sum + (d.amount_remaining ?? 0), 0)
  );

  // Template add form
  newTplFuente = '';
  newTplEsperado = 0;

  // Template edit
  editingTemplateId = signal<string | null>(null);
  editTplFuente = '';
  editTplEsperado = 0;

  // Deuda add form
  newDeudaNombre = '';
  newDeudaTipo: 'bank' | 'savings' = 'bank';
  newDeudaCapital = 0;
  newDeudaInteres = 0;
  newDeudaMeses = 0;
  newDeudaCuotaFinal = 0;
  newDeudaStartYear = new Date().getFullYear();
  newDeudaStartMonth = new Date().getMonth() + 1;

  // Deuda edit
  editingDeudaId = signal<string | null>(null);
  editDeudaNombre = '';
  editDeudaCuota = 0;
  editDeudaMeses: number | null = null;
  showDeudasArchivadas = signal(false);

  // Ahorro template add form
  newAhorroNombre = '';
  newAhorroPresupuestado = 0;

  // Ahorro template edit
  editingAhorroId = signal<string | null>(null);
  editAhorroNombre = '';
  editAhorroPresupuestado = 0;

  // Fondos de Ahorro
  fondos = signal<FondoAhorro[]>([]);
  fondosArchivados = signal<FondoAhorro[]>([]);
  showFondosArchivados = signal(false);
  editingFondoId = signal<string | null>(null);
  editFondoNombre = '';
  editFondoTotal = 0;
  editFondoMeses = 11;
  editFondoMonthly = 0;
  newFondoNombre = '';
  newFondoTotal = 0;
  newFondoMeses = 11;
  newFondoMonthly = 0;

  // Perfil / Pareja
  profileAhorroPct = 10;
  profileGastosPct = 5;
  savingProfile = signal(false);

  readonly meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  private userId = '';

  constructor(
    private supabase: SupabaseService,
    private templatesService: IngresoTemplatesService,
    private deudasService: DeudasService,
    private ahorroTemplatesService: AhorroTemplatesService,
    private fondosAhorroService: FondosAhorroService,
    private profileService: UserProfileService
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.client.auth.getSession();
    this.userId = data.session?.user.id ?? '';
    if (!this.userId) return;
    await Promise.all([
      this.loadTemplates(),
      this.loadDeudas(),
      this.loadAhorroTemplates(),
      this.loadFondos(),
      this.loadProfile()
    ]);
  }

  // ── Computed helpers ─────────────────────────────────────────

  get newDeudaTotalConInteres(): number {
    if (this.newDeudaTipo === 'savings') return this.newDeudaCapital * 1.05;
    if (this.newDeudaMeses > 0) return this.newDeudaCuotaCalculada * this.newDeudaMeses;
    return this.newDeudaCapital;
  }

  get newDeudaCuotaCalculada(): number {
    if (this.newDeudaTipo === 'savings') {
      const total = this.newDeudaCapital * 1.05;
      return this.newDeudaMeses > 0 ? total / this.newDeudaMeses : 0;
    }
    // Amortización francesa (cuota constante)
    if (this.newDeudaMeses > 0 && this.newDeudaCapital > 0) {
      const r = this.newDeudaInteres / 12 / 100;
      if (r === 0) return this.newDeudaCapital / this.newDeudaMeses;
      const factor = Math.pow(1 + r, this.newDeudaMeses);
      return this.newDeudaCapital * r * factor / (factor - 1);
    }
    return this.newDeudaCuotaFinal;
  }

  recalcCuota() {
    const calc = this.newDeudaCuotaCalculada;
    if (calc > 0) this.newDeudaCuotaFinal = Math.round(calc * 100) / 100;
  }

  deudaProgress(d: Deuda): number {
    if (!d.total_amount) return 0;
    return Math.min(100, ((d.total_amount - d.amount_remaining) / d.total_amount) * 100);
  }

  // ── Ingreso Templates ─────────────────────────────────────────

  private async loadTemplates() {
    this.templates.set(await this.templatesService.getAll(this.userId));
  }

  async addTemplate() {
    if (!this.newTplFuente.trim()) return;
    await this.templatesService.add({
      user_id: this.userId,
      fuente: this.newTplFuente.trim(),
      esperado: this.newTplEsperado,
      dia_de_paga: null,
      order_index: this.templates().length
    });
    this.newTplFuente = '';
    this.newTplEsperado = 0;
    await this.loadTemplates();
  }

  startEditTemplate(t: IngresoTemplate) {
    this.editingTemplateId.set(t.id);
    this.editTplFuente = t.fuente;
    this.editTplEsperado = t.esperado;
  }

  async saveTemplate(id: string) {
    await this.templatesService.update(id, {
      fuente: this.editTplFuente,
      esperado: this.editTplEsperado
    });
    this.editingTemplateId.set(null);
    await this.loadTemplates();
  }

  cancelEditTemplate() { this.editingTemplateId.set(null); }

  async removeTemplate(id: string) {
    await this.templatesService.remove(id);
    await this.loadTemplates();
  }

  // ── Deudas ────────────────────────────────────────────────────

  private async loadDeudas() {
    const [active, archived] = await Promise.all([
      this.deudasService.getActive(this.userId),
      this.deudasService.getArchived(this.userId)
    ]);
    this.deudas.set(active);
    this.deudasArchivadas.set(archived);
  }

  async addDeuda() {
    if (!this.newDeudaNombre.trim() || this.newDeudaCapital <= 0) return;
    const cuota = this.newDeudaCuotaFinal;
    const interestRate = this.newDeudaTipo === 'savings' ? 5 : this.newDeudaInteres;
    const total = this.newDeudaTipo === 'savings'
      ? this.newDeudaCapital * 1.05
      : (this.newDeudaMeses > 0 ? cuota * this.newDeudaMeses : this.newDeudaCapital);
    await this.deudasService.create({
      user_id: this.userId,
      name: this.newDeudaNombre.trim(),
      type: this.newDeudaTipo,
      principal_amount: this.newDeudaCapital,
      total_amount: total,
      interest_rate: interestRate,
      monthly_payment: cuota,
      amount_remaining: total,
      is_active: true,
      start_year: this.newDeudaStartYear || null,
      start_month: this.newDeudaStartMonth || null,
      num_months: this.newDeudaMeses > 0 ? this.newDeudaMeses : null
    });
    this.newDeudaNombre = '';
    this.newDeudaTipo = 'bank';
    this.newDeudaCapital = 0;
    this.newDeudaInteres = 0;
    this.newDeudaMeses = 0;
    this.newDeudaCuotaFinal = 0;
    this.newDeudaStartYear = new Date().getFullYear();
    this.newDeudaStartMonth = new Date().getMonth() + 1;
    await this.loadDeudas();
  }

  startEditDeuda(d: Deuda) {
    this.editingDeudaId.set(d.id);
    this.editDeudaNombre = d.name;
    this.editDeudaCuota = d.monthly_payment;
    this.editDeudaMeses = d.num_months ?? null;
  }

  async saveDeuda(id: string) {
    await this.deudasService.update(id, {
      name: this.editDeudaNombre,
      monthly_payment: this.editDeudaCuota,
      num_months: this.editDeudaMeses ?? null
    });
    this.editingDeudaId.set(null);
    await this.loadDeudas();
  }

  cancelEditDeuda() { this.editingDeudaId.set(null); }

  async archiveDeuda(id: string) {
    await this.deudasService.archive(id);
    await this.loadDeudas();
  }

  async toggleDeudasArchivadas() {
    this.showDeudasArchivadas.update(v => !v);
  }

  // ── Ahorro Templates ──────────────────────────────────────────

  private async loadAhorroTemplates() {
    this.ahorroTemplates.set(await this.ahorroTemplatesService.getAll(this.userId));
  }

  async addAhorroTemplate() {
    if (!this.newAhorroNombre.trim()) return;
    await this.ahorroTemplatesService.add({
      user_id: this.userId,
      name: this.newAhorroNombre.trim(),
      presupuestado: this.newAhorroPresupuestado,
      order_index: this.ahorroTemplates().length
    });
    this.newAhorroNombre = '';
    this.newAhorroPresupuestado = 0;
    await this.loadAhorroTemplates();
  }

  startEditAhorro(a: AhorroTemplate) {
    this.editingAhorroId.set(a.id);
    this.editAhorroNombre = a.name;
    this.editAhorroPresupuestado = a.presupuestado;
  }

  async saveAhorroTemplate(id: string) {
    await this.ahorroTemplatesService.update(id, {
      name: this.editAhorroNombre,
      presupuestado: this.editAhorroPresupuestado
    });
    this.editingAhorroId.set(null);
    await this.loadAhorroTemplates();
  }

  cancelEditAhorro() { this.editingAhorroId.set(null); }

  async removeAhorroTemplate(id: string) {
    await this.ahorroTemplatesService.remove(id);
    await this.loadAhorroTemplates();
  }

  // ── Fondos de Ahorro ──────────────────────────────────────────

  private async loadFondos() {
    const [active, archived] = await Promise.all([
      this.fondosAhorroService.getActive(this.userId),
      this.fondosAhorroService.getArchived(this.userId)
    ]);
    this.fondos.set(active);
    this.fondosArchivados.set(archived);
  }

  async addFondo() {
    if (!this.newFondoNombre.trim() || this.newFondoTotal <= 0) return;
    const meses = this.newFondoMeses || 11;
    await this.fondosAhorroService.create({
      user_id: this.userId,
      name: this.newFondoNombre.trim(),
      total_amount: this.newFondoTotal,
      monthly_amount: this.newFondoTotal / meses,
      num_months: meses,
      start_year: new Date().getFullYear(),
      start_month: new Date().getMonth() + 1,
      is_active: true
    });
    this.newFondoNombre = '';
    this.newFondoTotal = 0;
    this.newFondoMeses = 11;
    this.newFondoMonthly = 0;
    await this.loadFondos();
  }

  startEditFondo(f: FondoAhorro) {
    this.editingFondoId.set(f.id);
    this.editFondoNombre = f.name;
    this.editFondoTotal = f.total_amount;
    this.editFondoMeses = f.num_months ?? 11;
    this.editFondoMonthly = f.monthly_amount;
  }

  async saveFondo(id: string) {
    const meses = this.editFondoMeses || 11;
    await this.fondosAhorroService.update(id, {
      name: this.editFondoNombre,
      total_amount: this.editFondoTotal,
      monthly_amount: this.editFondoTotal / meses,
      num_months: meses
    });
    this.editingFondoId.set(null);
    await this.loadFondos();
  }

  cancelEditFondo() { this.editingFondoId.set(null); }

  async archiveFondo(id: string) {
    await this.fondosAhorroService.archive(id);
    await this.loadFondos();
  }

  async deleteFondo(id: string) {
    await this.fondosAhorroService.delete(id);
    await this.loadFondos();
  }

  toggleFondosArchivados() { this.showFondosArchivados.update(visible => !visible); }

  // ── Perfil / Pareja ───────────────────────────────────────────

  private async loadProfile() {
    const p = await this.profileService.getProfile(this.userId);
    this.profile.set(p);
    if (p) {
      this.profileAhorroPct = p.pareja_ahorro_pct ?? 10;
      this.profileGastosPct = p.pareja_gastos_pct ?? 5;
    }
  }

  async saveProfilePareja() {
    this.savingProfile.set(true);
    try {
      await this.profileService.upsertProfile({
        id: this.userId,
        ingreso_oficial: this.totalIngresosFijos(),
        pareja_ahorro_pct: this.profileAhorroPct,
        pareja_gastos_pct: this.profileGastosPct
      });
      await this.loadProfile();
    } finally {
      this.savingProfile.set(false);
    }
  }
}

