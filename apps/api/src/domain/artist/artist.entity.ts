import { ArtistId } from '../value-objects/artist-id.vo';

export interface ArtistProps {
  id: ArtistId;
  name: string;
  imageUrl?: string;
}

export class Artist {
  readonly id: ArtistId;
  readonly name: string;
  readonly imageUrl?: string;

  private constructor(props: ArtistProps) {
    this.id = props.id;
    this.name = props.name;
    this.imageUrl = props.imageUrl;
  }

  static create(props: ArtistProps): Artist {
    const name = props.name?.trim();
    if (!name) {
      throw new Error('Artist name is required');
    }
    return new Artist({
      id: props.id,
      name,
      imageUrl: props.imageUrl?.trim() || undefined,
    });
  }

  equals(other: Artist): boolean {
    return this.id.equals(other.id);
  }
}
