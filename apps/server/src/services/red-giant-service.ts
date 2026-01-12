/**
 * Red Giant Service
 *
 * Models the Red Giant Branch (RGB) phase of stellar evolution.
 *
 * This phase is characterized by:
 * - SWELLING: Dramatic increase in stellar radius (10-100x original size)
 * - COOLING: Decrease in surface temperature (making the star appear red)
 *
 * Physical Model:
 * - Stars enter RGB after exhausting hydrogen in the core
 * - Core contracts and heats up while the outer layers expand
 * - Luminosity increases despite surface cooling due to larger surface area
 * - The star evolves toward the RGB tip before helium flash (low-mass stars)
 */

import { EventEmitter } from './events.js';

export interface RedGiantStar {
  id: string;
  name: string;
  initialMass: number; // Solar masses
  currentMass: number; // Solar masses (may decrease due to mass loss)
  initialRadius: number; // Solar radii
  currentRadius: number; // Solar radii (SWELLING!)
  initialTemperature: number; // Kelvin
  currentTemperature: number; // Kelvin (COOLING!)
  initialLuminosity: number; // Solar luminosities
  currentLuminosity: number; // Solar luminosities
  age: number; // Million years
  rgbPhase: 'early' | 'mid' | 'tip' | 'helium-flash' | 'post-flash';
  createdAt: number;
  lastUpdated: number;
  status: 'active' | 'collapsed' | 'white-dwarf' | 'supernova';
}

export interface RedGiantMetrics {
  totalStars: number;
  activeStars: number;
  averageRadius: number;
  averageTemperature: number;
  totalMassLoss: number;
}

export interface RedGiantEvent {
  type: 'swelling' | 'cooling' | 'helium-flash' | 'core-collapse' | 'mass-loss';
  starId: string;
  timestamp: number;
  details: {
    [key: string]: any;
  };
}

export class RedGiantService {
  private stars: Map<string, RedGiantStar> = new Map();
  private eventHistory: RedGiantEvent[] = [];
  private readonly DATA_DIR: string;
  private events?: EventEmitter;

  // Physical constants (simplified for simulation)
  private readonly SOLAR_RADIUS = 6.96e8; // meters
  private readonly SOLAR_TEMP = 5778; // Kelvin
  private readonly STEFAN_BOLTZMANN = 5.67e-8; // W m^-2 K^-4

  // RGB phase parameters
  private readonly RGB_DURATION = 1000; // Million years (varies by mass)
  private readonly MAX_RADIUS_MULTIPLIER = 100; // Max radius increase
  private readonly MIN_TEMP_MULTIPLIER = 0.5; // Min temperature relative to initial

  constructor(DATA_DIR: string, events?: EventEmitter) {
    this.DATA_DIR = DATA_DIR;
    this.events = events;

    // Load existing data
    this.loadStars();
  }

  /**
   * Create a new Red Giant star
   */
  createRedGiant(name: string, mass: number): RedGiantStar {
    const id = this.generateId();
    const now = Date.now();

    // Initial stellar properties (main sequence values)
    const initialRadius = this.calculateMainSequenceRadius(mass);
    const initialTemp = this.calculateMainSequenceTemperature(mass);
    const initialLuminosity = this.calculateLuminosity(mass, initialRadius, initialTemp);

    const star: RedGiantStar = {
      id,
      name,
      initialMass: mass,
      currentMass: mass,
      initialRadius,
      currentRadius: initialRadius, // Starts at main sequence size
      initialTemperature: initialTemp,
      currentTemperature: initialTemp, // Starts at main sequence temp
      initialLuminosity,
      currentLuminosity: initialLuminosity,
      age: 0,
      rgbPhase: 'early',
      createdAt: now,
      lastUpdated: now,
      status: 'active',
    };

    this.stars.set(id, star);
    this.saveStars();

    // Emit event
    if (this.events) {
      this.events.emit('red-giant:created', { starId: id, star });
    }

    return star;
  }

  /**
   * Evolve a Red Giant star forward in time
   * This models the SWELLING and COOLING phases
   */
  evolveStar(starId: string, timeStep: number): RedGiantStar {
    const star = this.stars.get(starId);

    if (!star) {
      throw new Error(`Star not found: ${starId}`);
    }

    if (star.status !== 'active') {
      throw new Error(`Star is not active: ${starId}`);
    }

    const now = Date.now();
    const oldRadius = star.currentRadius;
    const oldTemp = star.currentTemperature;

    // Advance time
    star.age += timeStep;
    const progress = Math.min(star.age / this.RGB_DURATION, 1.0);

    // Determine RGB phase based on progress
    if (progress < 0.3) {
      star.rgbPhase = 'early';
    } else if (progress < 0.7) {
      star.rgbPhase = 'mid';
    } else if (progress < 0.95) {
      star.rgbPhase = 'tip';
    } else {
      star.rgbPhase = 'helium-flash';
    }

    // SWELLING: Calculate new radius (exponential growth)
    // Formula: R = R_initial * (1 + (MAX_MULTIPLIER - 1) * progress^1.5)
    const swellingFactor = 1 + (this.MAX_RADIUS_MULTIPLIER - 1) * Math.pow(progress, 1.5);
    star.currentRadius = star.initialRadius * swellingFactor;

    // COOLING: Calculate new temperature (exponential decay)
    // Formula: T = T_initial * (1 - (1 - MIN_MULTIPLIER) * progress^1.2)
    const coolingFactor = 1 - (1 - this.MIN_TEMP_MULTIPLIER) * Math.pow(progress, 1.2);
    star.currentTemperature = star.initialTemperature * coolingFactor;

    // Calculate luminosity (increases despite cooling due to larger radius)
    // L = 4πR²σT⁴
    star.currentLuminosity = this.calculateLuminosity(
      star.currentMass,
      star.currentRadius,
      star.currentTemperature
    );

    // Mass loss during RGB phase (stellar winds)
    // More massive stars lose more mass
    const massLossRate = 1e-7 * Math.pow(star.currentMass, 2) * progress;
    star.currentMass = Math.max(
      star.initialMass * 0.5, // Can't lose more than 50%
      star.initialMass - massLossRate
    );

    star.lastUpdated = now;

    // Record events for significant changes
    const radiusChangePercent = ((star.currentRadius - oldRadius) / oldRadius) * 100;
    const tempChangePercent = ((star.currentTemperature - oldTemp) / oldTemp) * 100;

    if (radiusChangePercent > 5) {
      this.recordEvent({
        type: 'swelling',
        starId,
        timestamp: now,
        details: {
          oldRadius: oldRadius,
          newRadius: star.currentRadius,
          changePercent: radiusChangePercent,
          phase: star.rgbPhase,
        },
      });
    }

    if (tempChangePercent < -2) {
      this.recordEvent({
        type: 'cooling',
        starId,
        timestamp: now,
        details: {
          oldTemp: oldTemp,
          newTemp: star.currentTemperature,
          changePercent: tempChangePercent,
          phase: star.rgbPhase,
        },
      });
    }

    // Check for helium flash (low-mass stars only)
    if (star.initialMass < 2.5 && progress >= 1.0) {
      this.recordEvent({
        type: 'helium-flash',
        starId,
        timestamp: now,
        details: {
          mass: star.currentMass,
          radius: star.currentRadius,
          luminosity: star.currentLuminosity,
        },
      });
      star.status = 'collapsed'; // Becomes helium-burning star
    }

    // Check for core collapse (high-mass stars)
    if (star.initialMass >= 8.0 && progress >= 1.0) {
      this.recordEvent({
        type: 'core-collapse',
        starId,
        timestamp: now,
        details: {
          mass: star.currentMass,
          radius: star.currentRadius,
          luminosity: star.currentLuminosity,
        },
      });
      star.status = 'supernova';
    }

    this.saveStars();

    return star;
  }

  /**
   * Get a Red Giant star by ID
   */
  getStar(starId: string): RedGiantStar | undefined {
    return this.stars.get(starId);
  }

  /**
   * Get all Red Giant stars
   */
  getAllStars(): RedGiantStar[] {
    return Array.from(this.stars.values());
  }

  /**
   * Get stars by status
   */
  getStarsByStatus(status: string): RedGiantStar[] {
    return this.getAllStars().filter((star) => star.status === status);
  }

  /**
   * Get stars by RGB phase
   */
  getStarsByPhase(phase: string): RedGiantStar[] {
    return this.getAllStars().filter((star) => star.rgbPhase === phase);
  }

  /**
   * Get service metrics
   */
  getMetrics(): RedGiantMetrics {
    const stars = this.getAllStars();
    const activeStars = stars.filter((s) => s.status === 'active');

    return {
      totalStars: stars.length,
      activeStars: activeStars.length,
      averageRadius:
        stars.length > 0 ? stars.reduce((sum, s) => sum + s.currentRadius, 0) / stars.length : 0,
      averageTemperature:
        stars.length > 0
          ? stars.reduce((sum, s) => sum + s.currentTemperature, 0) / stars.length
          : 0,
      totalMassLoss:
        stars.length > 0 ? stars.reduce((sum, s) => sum + (s.initialMass - s.currentMass), 0) : 0,
    };
  }

  /**
   * Get evolution events
   */
  getEvents(limit?: number, starId?: string): RedGiantEvent[] {
    let events = [...this.eventHistory];

    if (starId) {
      events = events.filter((e) => e.starId === starId);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Delete a Red Giant star
   */
  deleteStar(starId: string): boolean {
    const deleted = this.stars.delete(starId);
    if (deleted) {
      this.saveStars();
      if (this.events) {
        this.events.emit('red-giant:deleted', { starId });
      }
    }
    return deleted;
  }

  /**
   * Clear all stars
   */
  clearAllStars(): void {
    this.stars.clear();
    this.eventHistory = [];
    this.saveStars();
    if (this.events) {
      this.events.emit('red-giant:cleared', {});
    }
  }

  /**
   * Calculate main sequence radius based on mass
   * Approximation: R ∝ M^0.8 for solar-type stars
   */
  private calculateMainSequenceRadius(mass: number): number {
    if (mass < 1.0) {
      return Math.pow(mass, 0.8);
    } else if (mass < 2.0) {
      return Math.pow(mass, 0.9);
    } else {
      return Math.pow(mass, 0.7);
    }
  }

  /**
   * Calculate main sequence temperature based on mass
   * Approximation: T ∝ M^0.5
   */
  private calculateMainSequenceTemperature(mass: number): number {
    return this.SOLAR_TEMP * Math.pow(mass, 0.5);
  }

  /**
   * Calculate luminosity using Stefan-Boltzmann law
   * L = 4πR²σT⁴
   */
  private calculateLuminosity(mass: number, radius: number, temperature: number): number {
    // In solar units
    const radiusMeters = radius * this.SOLAR_RADIUS;
    const solarRadiusMeters = this.SOLAR_RADIUS;

    const luminosity = Math.pow(radius / 1.0, 2) * Math.pow(temperature / this.SOLAR_TEMP, 4);

    // Apply main sequence mass-luminosity relation correction
    const massLuminosityRelation = Math.pow(mass, 3.5);

    return luminosity;
  }

  /**
   * Record an evolution event
   */
  private recordEvent(event: RedGiantEvent): void {
    this.eventHistory.push(event);

    // Keep only last 1000 events
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-1000);
    }

    // Emit event
    if (this.events) {
      this.events.emit('red-giant:event', event);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `red-giant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save stars to disk
   */
  private saveStars(): void {
    try {
      const data = {
        stars: Array.from(this.stars.entries()),
        events: this.eventHistory,
      };
      // Would save to file in production
      // fs.writeFileSync(path.join(this.DATA_DIR, 'red-giants.json'), JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving Red Giant data:', error);
    }
  }

  /**
   * Load stars from disk
   */
  private loadStars(): void {
    try {
      // Would load from file in production
      // const data = JSON.parse(fs.readFileSync(path.join(this.DATA_DIR, 'red-giants.json'), 'utf8'));
      // this.stars = new Map(data.stars);
      // this.eventHistory = data.events || [];
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.stars = new Map();
      this.eventHistory = [];
    }
  }
}
