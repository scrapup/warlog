/**
 * Scriptable {@link GitClient} fake.
 */
import type { GitClient } from '../../../src/core/ports/git-client.port.ts';

/** Canned answers of the fake. */
export interface FakeGitState {
  /** Common git dir (undefined: not a repository). */
  commonDir?: string;
  /** Top-level directory. */
  topLevel?: string;
  /** Remotes by name. */
  remotes?: Record<string, string>;
  /** Current branch. */
  branch?: string;
  /** Whether git is installed. */
  available?: boolean;
}

/** Git client answering from a state object. */
export class FakeGitClient implements GitClient {
  /** Canned state. */
  readonly state: FakeGitState;

  /**
   * Creates the fake.
   * @param state - Canned answers.
   */
  constructor(state: FakeGitState = {}) {
    this.state = state;
  }

  /**
   * Common dir.
   * @returns Canned value.
   */
  async commonDir(): Promise<string | undefined> {
    return this.state.commonDir;
  }

  /**
   * Top level.
   * @returns Canned value.
   */
  async topLevel(): Promise<string | undefined> {
    return this.state.topLevel;
  }

  /**
   * Remote names.
   * @returns Canned names.
   */
  async remotes(): Promise<string[]> {
    return Object.keys(this.state.remotes ?? {});
  }

  /**
   * Remote URL.
   * @param _cwd - Ignored.
   * @param name - Remote name.
   * @returns Canned URL.
   */
  async remoteUrl(_cwd: string, name: string): Promise<string | undefined> {
    return this.state.remotes?.[name];
  }

  /**
   * Current branch.
   * @returns Canned branch.
   */
  async currentBranch(): Promise<string | undefined> {
    return this.state.branch;
  }

  /**
   * Availability.
   * @returns Canned availability (default true).
   */
  async isAvailable(): Promise<boolean> {
    return this.state.available ?? true;
  }
}
