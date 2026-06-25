import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { EMPTY } from 'rxjs';

import { HomeComponent } from './home.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';
import { FacturasService } from '../../../shared/services/facturas.service';
import { SectionService } from '../../../shared/services/section.service';
import { Factura, Gasto, Ahorro, DeudaSection } from '../../../shared/models';

// Type alias for accessing the component's private data signals in tests.
interface HomeComponentPrivate {
  facturasData: { set: (items: Factura[]) => void };
  gastosData: { set: (items: Gasto[]) => void };
  ahorrosData: { set: (items: Ahorro[]) => void };
  deudasData: { set: (items: DeudaSection[]) => void };
}

function makeFactura(overrides: Partial<Factura> = {}): Factura {
  return {
    id: 'f1',
    month_id: 'm',
    user_id: 'u',
    name: 'F',
    fecha: null,
    presupuestado: 0,
    real: 0,
    is_recurring: false,
    order_index: 0,
    ...overrides,
  };
}

function makeGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: 'g1',
    month_id: 'm',
    user_id: 'u',
    name: 'G',
    presupuestado: 0,
    real: 0,
    tipo: 'variables',
    order_index: 0,
    ...overrides,
  };
}

function makeAhorro(overrides: Partial<Ahorro> = {}): Ahorro {
  return {
    id: 'a1',
    month_id: 'm',
    user_id: 'u',
    name: 'A',
    presupuestado: 0,
    real: 0,
    order_index: 0,
    ...overrides,
  };
}

function makeDeuda(overrides: Partial<DeudaSection> = {}): DeudaSection {
  return {
    id: 'd1',
    month_id: 'm',
    user_id: 'u',
    name: 'D',
    presupuestado: 0,
    real: 0,
    order_index: 0,
    ...overrides,
  };
}

describe('HomeComponent donutSegments', () => {
  let component: HomeComponent;
  let priv: HomeComponentPrivate;

  beforeEach(() => {
    // currentUser is null so the constructor skips loadMonthData and we can
    // drive the data signals directly via the typed handle below.
    const authStub = { currentUser: null };
    const routerStub = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const routeStub = { snapshot: { queryParams: {} } } as unknown as ActivatedRoute;
    const locationStub = jasmine.createSpyObj<Location>('Location', ['replaceState']);
    const monthServiceStub = jasmine.createSpyObj<MonthService>('MonthService', ['getOrCreateMonth']);
    const ingresosServiceStub = jasmine.createSpyObj<IngresosService>('IngresosService', ['getAll', 'add']);
    ingresosServiceStub.getAll.and.returnValue(EMPTY);
    const facturasServiceStub = jasmine.createSpyObj<FacturasService>('FacturasService', ['getAll', 'add']);
    facturasServiceStub.getAll.and.returnValue(EMPTY);
    const sectionServiceStub = {
      gastos: { getAll: () => EMPTY, add: () => Promise.resolve() },
      ahorros: { getAll: () => EMPTY, add: () => Promise.resolve() },
      deudas: { getAll: () => EMPTY, add: () => Promise.resolve() },
      pareja: { getAll: () => EMPTY, add: () => Promise.resolve() },
    } as unknown as SectionService;

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: Location, useValue: locationStub },
        { provide: MonthService, useValue: monthServiceStub },
        { provide: IngresosService, useValue: ingresosServiceStub },
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: SectionService, useValue: sectionServiceStub },
      ],
    });

    const fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    priv = component as unknown as HomeComponentPrivate;
  });

  it('computes percentage as Math.round(value/total*100) for each segment', () => {
    // Facturas 400, Gastos 600, Ahorros 200, Deudas 200 → total 1400.
    priv.facturasData.set([makeFactura({ real: 400 })]);
    priv.gastosData.set([makeGasto({ real: 600 })]);
    priv.ahorrosData.set([makeAhorro({ real: 200 })]);
    priv.deudasData.set([makeDeuda({ real: 200 })]);

    const segments = component.donutSegments();
    const byLabel = Object.fromEntries(segments.map(s => [s.label, s]));

    expect(byLabel['Facturas'].percentage).toBe(Math.round(400 / 1400 * 100));
    expect(byLabel['Gastos'].percentage).toBe(Math.round(600 / 1400 * 100));
    expect(byLabel['Ahorros'].percentage).toBe(Math.round(200 / 1400 * 100));
    expect(byLabel['Deudas'].percentage).toBe(Math.round(200 / 1400 * 100));
  });

  it('omits the callout when a segment is below 8% (e.g. 50€ out of 1400)', () => {
    // Facturas 50 (~4%, below the 8% threshold) plus enough other items to total 1400.
    priv.facturasData.set([makeFactura({ real: 50 })]);
    priv.gastosData.set([makeGasto({ real: 1000 })]);
    priv.ahorrosData.set([makeAhorro({ real: 200 })]);
    priv.deudasData.set([makeDeuda({ real: 150 })]);

    const facturas = component.donutSegments().find(s => s.label === 'Facturas');

    expect(facturas).toBeDefined();
    expect(facturas!.percentage).toBeLessThan(8);
    expect(facturas!.callout).toBeNull();
  });

  it('uses callout.anchor="start" on the right side (positive cosine at midAngle)', () => {
    // Facturas is the first segment starting at the top of the donut and
    // sweeping clockwise into the right half → positive cosine at its midAngle.
    priv.facturasData.set([makeFactura({ real: 400 })]);
    priv.gastosData.set([makeGasto({ real: 600 })]);
    priv.ahorrosData.set([makeAhorro({ real: 200 })]);
    priv.deudasData.set([makeDeuda({ real: 200 })]);

    const facturas = component.donutSegments().find(s => s.label === 'Facturas');

    expect(facturas).toBeDefined();
    expect(facturas!.callout).not.toBeNull();
    expect(facturas!.callout!.anchor).toBe('start');
  });

  it('uses callout.anchor="end" on the left side (negative cosine at midAngle)', () => {
    // Ahorros sits in the bottom-left of the donut with cos(midAngle) < 0.
    priv.facturasData.set([makeFactura({ real: 400 })]);
    priv.gastosData.set([makeGasto({ real: 600 })]);
    priv.ahorrosData.set([makeAhorro({ real: 200 })]);
    priv.deudasData.set([makeDeuda({ real: 200 })]);

    const ahorros = component.donutSegments().find(s => s.label === 'Ahorros');

    expect(ahorros).toBeDefined();
    expect(ahorros!.callout).not.toBeNull();
    expect(ahorros!.callout!.anchor).toBe('end');
  });
});
